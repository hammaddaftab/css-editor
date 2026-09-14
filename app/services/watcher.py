"""Watch project files and publish project-scoped SSE events."""

import asyncio
import logging
from pathlib import Path

from watchfiles import Change, awatch

from app.services.broadcaster import broadcaster
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
    """Read a document and its two CSS layers for an SSE payload."""
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


async def _publish_document_change(
    *,
    project: str,
    filename: str,
    project_path: Path,
    document_path: Path,
    action: str,
) -> None:
    data = _read_project_document(project_path, document_path)
    payload = {
        "project": project,
        "filename": filename,
        "action": action,
        **data,
    }
    await broadcaster.publish("file:change", payload)
    await broadcaster.publish("render", payload)


async def watch_directory(projects_root: Path) -> None:
    """Watch every project directory recursively."""
    root = projects_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    logger.info("Starting project watcher on %s", root)

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
                            await broadcaster.publish("file:change", {
                                "project": project,
                                "filename": filename,
                                "action": "deleted",
                                "project_css": "",
                            })
                            continue
                        if path.suffix.lower() == ".md":
                            await broadcaster.publish("file:change", {
                                "project": project,
                                "filename": filename,
                                "action": "deleted",
                            })
                        elif path.suffix.lower() == ".css":
                            document_path = path.with_suffix(".md")
                            if document_path.exists():
                                await _publish_document_change(
                                    project=project,
                                    filename=document_path.relative_to(project_path).as_posix(),
                                    project_path=project_path,
                                    document_path=document_path,
                                    action="modified",
                                )
                        continue

                    await asyncio.sleep(0.05)

                    # project.css is a shared stylesheet, not a Markdown page.
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
                        await _publish_document_change(
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


async def watch_markdown_file(path: Path) -> None:
    """Watch an explicitly configured external Markdown file."""
    target = path.resolve()
    logger.info("Starting single-file watcher on %s", target)
    try:
        async for _ in awatch(target, debounce=300):
            try:
                if not target.exists():
                    continue
                content = target.read_text(encoding="utf-8")
                css_path = target.with_suffix(".css")
                css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
                html = render_markdown(content)
                payload = {
                    "filename": target.name,
                    "action": "modified",
                    "markdown": content,
                    "css": css,
                    "html": html,
                }
                await broadcaster.publish("file:change", payload)
                await broadcaster.publish("render", payload)
            except Exception as exc:  # noqa: BLE001
                await broadcaster.publish("error", {"message": str(exc)})
    except asyncio.CancelledError:
        raise


class ProjectWatcherManager:
    """Manage dynamic lifecycle of the project directory watcher."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._current_path: Path | None = None

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

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


watcher_manager = ProjectWatcherManager()

