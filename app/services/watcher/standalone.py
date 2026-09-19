"""Standalone Watch Mode Handler for external documents outside project boundaries.

Responsibilities:
- Watches an external document and its associated CSS parent directory.
- Resilient to atomic saves (Neovim/Vim/VS Code temp-file replacement).
- Emits unified 'document:change' SSE events when the watched document changes.
- Contains its own lifecycle and cleanup logic: start() and stop() manage internal tasks.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from watchfiles import Change, awatch

from app.routers.assets import encode_doc_token
from app.services.broadcaster import broadcaster
from app.services.document_svc import read_document_io
from app.services.markdown_svc import render_markdown

if TYPE_CHECKING:
    from app.models.context import DocumentContext, WatchDocumentContext

logger = logging.getLogger(__name__)


async def watch_document(context: DocumentContext) -> None:
    """Watch an active document's parent directory with atomic save resilience.

    Monitors context.doc_path.parent (and css_path.parent if different) so that
    temp-file renames triggered by editors (e.g. Neovim, VS Code) reliably trigger
    reloads without breaking the inotify/kqueue watch.
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
                if context.mode == "project" and getattr(context, "project_css_path", None) and context.project_css_path.is_file():
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


class WatchModeHandler:
    """Handles standalone Watch Mode for individual external documents.

    Cleanup is completely contained within this class. Calling stop() cancels
    the internal background task and releases all resource handles.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._context: WatchDocumentContext | None = None

    @property
    def is_active(self) -> bool:
        """Return True if the standalone watcher task is currently running."""
        return bool(self._task and not self._task.done())

    @property
    def current_doc(self) -> Path | None:
        """Return the path of the document currently being watched, if any."""
        return self._context.doc_path if self._context else None

    @property
    def context(self) -> WatchDocumentContext | None:
        """Return the current active WatchDocumentContext."""
        return self._context

    async def start(self, context: WatchDocumentContext) -> None:
        """Start or switch watching to the specified standalone document context."""
        resolved_doc = context.doc_path.resolve()
        if (
            self._context
            and self._context.doc_path.resolve() == resolved_doc
            and self._context.css_path.resolve() == context.css_path.resolve()
            and self.is_active
        ):
            return

        # Clean up any existing watcher before starting a new one
        await self.stop()

        self._context = context
        self._task = asyncio.create_task(
            watch_document(context),
            name=f"standalone-watch-{resolved_doc.name}",
        )
        logger.info("WatchModeHandler started watching %s", resolved_doc)

    async def stop(self) -> None:
        """Stop watching and clean up the internal background task."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            except Exception as exc:  # noqa: BLE001
                logger.warning("Exception while stopping standalone watcher: %s", exc)
        self._task = None
        self._context = None

    async def cleanup(self) -> None:
        """Alias for stop() to provide explicit cleanup semantics."""
        await self.stop()
