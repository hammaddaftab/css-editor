"""Directory-level file watcher for project and standalone documents.

Features:
- Resilient to atomic saves: Watches parent directories rather than individual files,
  ensuring hot-reload survives temp-file renames and inode replacement from Neovim, Vim,
  VS Code, and Obsidian.
- Emits unified 'document:change' SSE events alongside backward-compatible 'file:change'
  and 'render' events.
- Unified WatcherManager handling both project workspace trees and standalone files.
"""
import asyncio
import logging
from pathlib import Path

from watchfiles import Change, awatch

from app.models.context import DocumentContext, WatchDocumentContext
from app.routers.assets import encode_doc_token
from app.services.broadcaster import broadcaster
from app.services.context_svc import compute_effective_css, resolve_watch_context
from app.services.document_svc import read_document_io
from app.services.markdown_svc import render_markdown

logger = logging.getLogger(__name__)

_WATCHED_SUFFIXES = {".md", ".css"}


def _project_file(path: Path, projects_root: Path) -> tuple[str, str] | None:
    """Return ``(project, filename)`` for a safe project Markdown/CSS path."""
    try:
        relative = path.resolve().relative_to(projects_root.resolve())
    except (ValueError, RuntimeError):
        return None

    if len(relative.parts) < 2 or path.suffix.lower() not in _WATCHED_SUFFIXES:
        return None
    if any(part.startswith(".") for part in relative.parts):
        return None

    project = relative.parts[0]
    project_path = projects_root / project
    if not project_path.is_dir():
        return None

    filename = Path(*relative.parts[1:]).as_posix()
    return project, filename


def _read_project_document(project_path: Path, document_path: Path) -> dict:
    """Read a project document and its CSS layers."""
    page_css_path = document_path.with_suffix(".css")
    project_css_path = project_path / "project.css"
    markdown = document_path.read_text(encoding="utf-8")
    page_css = page_css_path.read_text(encoding="utf-8") if page_css_path.exists() else ""
    project_css = project_css_path.read_text(encoding="utf-8") if project_css_path.exists() else ""
    return {
        "markdown": markdown,
        "css": page_css,
        "project_css": project_css,
        "html": render_markdown(markdown),
    }


async def _publish_project_document_change(
    *,
    project: str,
    filename: str,
    project_path: Path,
    document_path: Path,
    action: str,
) -> None:
    """Publish unified document:change event for a project file change."""
    data = _read_project_document(project_path, document_path)

    unified_payload = {
        "event": "document:change",
        "doc_path": str(document_path),
        "filename": document_path.name,
        "mode": "project",
        "action": action,
        "markdown": data["markdown"],
        "css": data["css"],
        "shared_css": data["project_css"] or None,
        "doc_token": encode_doc_token(document_path.parent),
        "html": data["html"],
        "project": project,
    }
    await broadcaster.publish("document:change", unified_payload)


async def watch_directory(projects_root: Path) -> None:
    """Watch every project directory recursively."""
    root = projects_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    logger.info("Starting project directory watcher on %s", root)

    try:
        async for changes in awatch(root, recursive=True, debounce=300):
            for change_type, path_str in changes:
                try:
                    path = Path(path_str)
                    scoped = _project_file(path, root)
                    if not scoped:
                        continue
                    project, filename = scoped
                    project_path = root / project

                    if change_type == Change.deleted:
                        if filename == "project.css":
                            await broadcaster.publish("document:change", {
                                "event": "document:change",
                                "doc_path": str(project_path / "project.css"),
                                "filename": "project.css",
                                "mode": "project",
                                "action": "deleted",
                                "project": project,
                                "markdown": None,
                                "css": None,
                                "shared_css": "",
                                "doc_token": encode_doc_token(project_path),
                                "html": None,
                            })
                            continue
                        if path.suffix.lower() == ".md":
                            await broadcaster.publish("document:change", {
                                "event": "document:change",
                                "doc_path": str(path),
                                "filename": filename,
                                "mode": "project",
                                "action": "deleted",
                                "project": project,
                                "markdown": None,
                                "css": None,
                                "shared_css": None,
                                "doc_token": encode_doc_token(project_path),
                                "html": None,
                            })
                        elif path.suffix.lower() == ".css":
                            document_path = path.with_suffix(".md")
                            if document_path.exists():
                                await _publish_project_document_change(
                                    project=project,
                                    filename=document_path.relative_to(project_path).as_posix(),
                                    project_path=project_path,
                                    document_path=document_path,
                                    action="modified",
                                )
                        continue

                    await asyncio.sleep(0.05)

                    if filename == "project.css":
                        await broadcaster.publish("file:change", {
                            "project": project,
                            "filename": filename,
                            "action": "modified" if change_type == Change.modified else "added",
                            "project_css": path.read_text(encoding="utf-8") if path.exists() else "",
                        })
                        continue

                    document_path = path if path.suffix.lower() == ".md" else path.with_suffix(".md")
                    if document_path.exists():
                        await _publish_project_document_change(
                            project=project,
                            filename=document_path.relative_to(project_path).as_posix(),
                            project_path=project_path,
                            document_path=document_path,
                            action="modified" if change_type == Change.modified else "added",
                        )
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Error processing project file event: %s", exc)
    except asyncio.CancelledError:
        logger.info("Project file watcher cancelled cleanly.")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Project file watcher encountered an error: %s", exc)


async def watch_document(context: DocumentContext) -> None:
    """Watch an active document's parent directory.

    Resilient to atomic saves: Monitors context.doc_path.parent (and css_path.parent
    if different) so that temp-file renames triggered by editors (e.g. Neovim, VS Code)
    reliably trigger reloads without breaking the inotify/kqueue watch.
    """
    doc_path = context.doc_path.resolve()
    doc_dir = doc_path.parent
    css_path = context.css_path.resolve()
    css_dir = css_path.parent

    # Distinct watch directories to monitor
    watch_dirs = {doc_dir, css_dir}
    target_names = {doc_path.name, css_path.name}
    if context.mode == "project":
        target_names.add("project.css")

    logger.info("Starting atomic-safe directory watcher on %s for %s", watch_dirs, target_names)

    try:
        async for changes in awatch(*watch_dirs, recursive=False, debounce=300):
            matched = False
            action = "modified"

            for change_type, path_str in changes:
                changed_name = Path(path_str).name
                if changed_name in target_names:
                    matched = True
                    if change_type == Change.deleted and changed_name == doc_path.name:
                        action = "deleted"
                    break

            if not matched:
                continue

            try:
                if action == "deleted":
                    del_payload = {
                        "event": "document:change",
                        "doc_path": str(doc_path),
                        "filename": doc_path.name,
                        "mode": context.mode,
                        "action": "deleted",
                        "markdown": "",
                        "css": "",
                        "shared_css": None,
                        "doc_token": encode_doc_token(doc_dir),
                        "html": "",
                    }
                    await broadcaster.publish("document:change", del_payload)
                    continue

                if not doc_path.is_file():
                    continue

                markdown, css, _ = read_document_io(doc_path, css_path)
                html = render_markdown(markdown)
                doc_token = encode_doc_token(doc_dir)

                shared_css = None
                if context.mode == "project" and context.project_css_path and context.project_css_path.is_file():
                    shared_css = context.project_css_path.read_text(encoding="utf-8")

                unified_payload = {
                    "event": "document:change",
                    "doc_path": str(doc_path),
                    "filename": doc_path.name,
                    "mode": context.mode,
                    "action": "modified",
                    "markdown": markdown,
                    "css": css,
                    "shared_css": shared_css,
                    "doc_token": doc_token,
                    "html": html,
                }
                await broadcaster.publish("document:change", unified_payload)

            except Exception as exc:  # noqa: BLE001
                logger.exception("Error processing watched document change: %s", exc)
                await broadcaster.publish("error", {"message": str(exc)})

    except asyncio.CancelledError:
        logger.info("Document watcher cancelled cleanly for %s", doc_path)
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Document watcher encountered error: %s", exc)


async def watch_markdown_file(path: Path, custom_css: Path | None = None) -> None:
    """Watch an explicitly configured external Markdown file using safe directory watching."""
    context = resolve_watch_context(doc_path=path, custom_css=custom_css)
    await watch_document(context)


class ProjectWatcherManager:
    """Manage dynamic lifecycle of directory watchers."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._doc_task: asyncio.Task | None = None
        self._current_path: Path | None = None
        self._current_doc: Path | None = None

    @property
    def current_path(self) -> Path | None:
        return self._current_path

    def start(self, projects_root: Path) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
        self._current_path = projects_root.resolve()
        self._task = asyncio.create_task(
            watch_directory(self._current_path),
            name="project-directory-watcher",
        )

    def switch_directory(self, new_root: Path) -> None:
        resolved = new_root.resolve()
        if self._current_path == resolved and self._task and not self._task.done():
            return
        logger.info("Switching project watcher to %s", resolved)
        self.start(resolved)

    def watch_document(self, context: DocumentContext) -> None:
        """Start or switch watching to a specific document's directory."""
        if self._doc_task and not self._doc_task.done():
            self._doc_task.cancel()
        self._current_doc = context.doc_path.resolve()
        self._doc_task = asyncio.create_task(
            watch_document(context),
            name=f"document-watcher-{self._current_doc.name}",
        )

    async def stop(self) -> None:
        for task in (self._task, self._doc_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._task = None
        self._doc_task = None


watcher_manager = ProjectWatcherManager()
