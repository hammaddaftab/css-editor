"""Watch Orchestrator Layer.

Responsibilities:
- Detects watch mode triggers and manages mode transitions ('watch' vs 'project' vs 'idle').
- Can be activated by CLI flag on boot or by frontend API calls.
- Pure detection and coordination layer: does NOT perform file watching or I/O itself.
- Delegates to WatchModeHandler when watch mode is detected and ProjectWatcherHandler when project mode is detected.
- Coordinates clean transitions ensuring each handler executes its own self-contained cleanup.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from app.services.context_svc import resolve_watch_context
from app.services.watcher.project import ProjectWatcherHandler
from app.services.watcher.standalone import WatchModeHandler

if TYPE_CHECKING:
    from app.models.context import DocumentContext

logger = logging.getLogger(__name__)


class WatchOrchestrator:
    """Orchestrates file watching modes by detection and delegation only."""

    def __init__(
        self,
        watch_handler: WatchModeHandler | None = None,
        project_handler: ProjectWatcherHandler | None = None,
    ) -> None:
        self.watch_handler = watch_handler or WatchModeHandler()
        self.project_handler = project_handler or ProjectWatcherHandler()
        self._current_mode: Literal["watch", "project", "idle"] = "idle"
        self._active_target: DocumentContext | None = None
        self._projects_root: Path | None = None

    @property
    def current_mode(self) -> Literal["watch", "project", "idle"]:
        """Return the currently detected and active mode."""
        return self._current_mode

    @property
    def active_target(self) -> DocumentContext | None:
        """Return the active DocumentContext, if any."""
        return self._active_target

    @property
    def current_doc(self) -> Path | None:
        """Return the path of the currently watched standalone document, if any."""
        return self.watch_handler.current_doc

    @property
    def current_project(self) -> str | None:
        """Return the currently watched project name, if any."""
        return self.project_handler.current_project

    @property
    def projects_root(self) -> Path | None:
        """Return the configured projects root directory."""
        return self._projects_root

    # ── Workspace Root Configuration ───────────────────────────────────────────

    def set_projects_root(self, projects_root: Path) -> None:
        """Configure the active projects root directory."""
        self._projects_root = projects_root.resolve()

    def switch_projects_root(self, new_root: Path) -> None:
        """Update projects root and restart project watcher if currently active."""
        self._projects_root = new_root.resolve()
        if self._current_mode == "project" and self.project_handler.current_project:
            proj_dir = self._projects_root / self.project_handler.current_project
            if proj_dir.is_dir():
                asyncio.create_task(
                    self.project_handler.start(self.project_handler.current_project, proj_dir),
                )

    # ── 1. Detection & Activation: CLI Flag ──────────────────────────────────────

    async def detect_cli_watch(
        self,
        watch_path: Path | None,
        custom_css: Path | None = None,
    ) -> bool:
        """Detect whether watch mode was activated via CLI flag on startup.

        If watch_path is provided and points to a file, resolves WatchDocumentContext,
        stops any project watcher, and activates WatchModeHandler.
        """
        if not watch_path:
            return False

        resolved = Path(watch_path).expanduser().resolve()
        if not resolved.is_file():
            logger.warning("CLI watch path does not exist or is not a file: %s", resolved)
            return False

        logger.info("Watch Orchestrator: Detected CLI watch flag for %s", resolved)
        context = resolve_watch_context(resolved, custom_css)
        await self.detect_and_activate(context)
        return True

    # ── 2. Detection & Activation: Frontend Calls ────────────────────────────────

    async def detect_and_activate(self, context: DocumentContext) -> None:
        """Detect document context mode from frontend call and coordinate transition."""
        if context.mode == "watch":
            logger.info("Watch Orchestrator: Detected frontend watch mode request for %s", context.doc_path)
            # 1. Clean up active project watcher
            await self.project_handler.stop()
            # 2. Start standalone watch handler
            await self.watch_handler.start(context)
            self._current_mode = "watch"
            self._active_target = context
        else:
            logger.info(
                "Watch Orchestrator: Detected frontend project mode request for [%s] / %s",
                context.project_name,
                context.doc_path.name,
            )
            # 1. Clean up standalone watch handler
            await self.watch_handler.stop()
            # 2. Start respective project watcher strictly on context.project_dir
            await self.project_handler.start(
                project_name=context.project_name,
                project_dir=context.project_dir,
            )
            self._current_mode = "project"
            self._active_target = context

    # ── 3. Shutdown & Cleanup ──────────────────────────────────────────────────

    async def shutdown(self) -> None:
        """Coordinate clean shutdown of both watch mode and project watcher handlers."""
        logger.info("Watch Orchestrator: Shutting down all watchers cleanly.")
        await self.watch_handler.stop()
        await self.project_handler.stop()
        self._current_mode = "idle"
        self._active_target = None
