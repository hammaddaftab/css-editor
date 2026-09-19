"""Project Watcher Layer for watching a respective project directory only.

Responsibilities:
- Watches ONLY the currently active project folder (<projects_root>/<project>/).
- Never watches sibling projects or the entire projects_root.
- Resilient to additions, deletions, and edits of Markdown, page-specific CSS, and project.css.
- Emits unified 'document:change' SSE events and 'file:change' events.
- Contains its own lifecycle and cleanup logic: start() and stop() manage internal tasks.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from watchfiles import Change, awatch

from app.routers.assets import encode_doc_token
from app.services.broadcaster import broadcaster
from app.services.markdown_svc import render_markdown

logger = logging.getLogger(__name__)

_WATCHED_EXTENSIONS = {".md", ".css"}


def _read_project_document(project_path: Path, document_path: Path) -> dict:
    """Read a project document and its CSS layers."""
    page_css_path = document_path.with_suffix(".css")
    project_css_path = project_path / "project.css"
    markdown = document_path.read_text(encoding="utf-8") if document_path.is_file() else ""
    page_css = page_css_path.read_text(encoding="utf-8") if page_css_path.is_file() else ""
    project_css = project_css_path.read_text(encoding="utf-8") if project_css_path.is_file() else ""
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


async def watch_project_directory(project_name: str, project_dir: Path) -> None:
    """Watch the respective project directory only."""
    root = project_dir.resolve()
    if not root.is_dir():
        logger.warning("Target project directory does not exist: %s", root)
        return

    logger.info("Starting project watcher strictly on [%s] at %s", project_name, root)

    try:
        async for changes in awatch(root, recursive=True, debounce=300):
            for change_type, path_str in changes:
                try:
                    path = Path(path_str).resolve()
                    try:
                        relative = path.relative_to(root)
                    except ValueError:
                        continue

                    # Ignore hidden files/directories (e.g. .git)
                    if any(part.startswith(".") for part in relative.parts):
                        continue

                    if path.suffix.lower() not in _WATCHED_EXTENSIONS:
                        continue

                    filename = relative.as_posix()

                    if change_type == Change.deleted:
                        if filename == "project.css":
                            await broadcaster.publish("document:change", {
                                "event": "document:change",
                                "doc_path": str(root / "project.css"),
                                "filename": "project.css",
                                "mode": "project",
                                "action": "deleted",
                                "project": project_name,
                                "markdown": None,
                                "css": None,
                                "shared_css": "",
                                "doc_token": encode_doc_token(root),
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
                                "project": project_name,
                                "markdown": None,
                                "css": None,
                                "shared_css": None,
                                "doc_token": encode_doc_token(root),
                                "html": None,
                            })
                        elif path.suffix.lower() == ".css":
                            document_path = path.with_suffix(".md")
                            if document_path.exists():
                                await _publish_project_document_change(
                                    project=project_name,
                                    filename=document_path.relative_to(root).as_posix(),
                                    project_path=root,
                                    document_path=document_path,
                                    action="modified",
                                )
                        continue

                    # Handle project.css changes
                    if filename == "project.css":
                        await broadcaster.publish("file:change", {
                            "project": project_name,
                            "filename": filename,
                            "action": "modified" if change_type == Change.modified else "added",
                            "project_css": path.read_text(encoding="utf-8") if path.exists() else "",
                        })
                        continue

                    # Handle Markdown or attached CSS changes
                    document_path = path if path.suffix.lower() == ".md" else path.with_suffix(".md")
                    if document_path.exists():
                        await _publish_project_document_change(
                            project=project_name,
                            filename=document_path.relative_to(root).as_posix(),
                            project_path=root,
                            document_path=document_path,
                            action="modified" if change_type == Change.modified else "added",
                        )
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Error processing event in project [%s]: %s", project_name, exc)
    except asyncio.CancelledError:
        logger.info("Project [%s] watcher cancelled cleanly.", project_name)
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Project [%s] watcher encountered an error: %s", project_name, exc)


class ProjectWatcherHandler:
    """Handles file watching strictly for the active respective project directory.

    Cleanup is completely contained within this class. Calling stop() cancels
    the internal background task and resets internal state.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._project_name: str | None = None
        self._project_dir: Path | None = None

    @property
    def is_active(self) -> bool:
        """Return True if the project watcher task is currently running."""
        return bool(self._task and not self._task.done())

    @property
    def current_project(self) -> str | None:
        """Return the name of the project currently being watched, if any."""
        return self._project_name

    @property
    def current_project_dir(self) -> Path | None:
        """Return the directory of the project currently being watched, if any."""
        return self._project_dir

    async def start(self, project_name: str, project_dir: Path) -> None:
        """Start or switch watching to the respective project directory only."""
        resolved_dir = project_dir.resolve()
        if (
            self._project_name == project_name
            and self._project_dir == resolved_dir
            and self.is_active
        ):
            return

        # Clean up previous project watch task first
        await self.stop()

        self._project_name = project_name
        self._project_dir = resolved_dir
        self._task = asyncio.create_task(
            watch_project_directory(project_name, resolved_dir),
            name=f"project-watcher-{project_name}",
        )
        logger.info("ProjectWatcherHandler started watching project [%s] at %s", project_name, resolved_dir)

    async def stop(self) -> None:
        """Stop watching and clean up the internal background task."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            except Exception as exc:  # noqa: BLE001
                logger.warning("Exception while stopping project watcher: %s", exc)
        self._task = None
        self._project_name = None
        self._project_dir = None

    async def cleanup(self) -> None:
        """Alias for stop() to provide explicit cleanup semantics."""
        await self.stop()
