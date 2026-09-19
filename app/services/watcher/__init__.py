"""Watcher subsystem package.

Layers:
1. WatchOrchestrator: Pure detection of watch mode (CLI flag or frontend call) & coordination.
2. WatchModeHandler: Standalone document watch layer with self-contained cleanup.
3. ProjectWatcherHandler: Project watch layer watching respective project only with self-contained cleanup.
"""
from pathlib import Path

from app.models.context import DocumentContext
from app.services.context_svc import resolve_watch_context
from app.services.watcher.orchestrator import WatchOrchestrator
from app.services.watcher.project import ProjectWatcherHandler, watch_project_directory
from app.services.watcher.standalone import WatchModeHandler, watch_document

# Global singletons
watch_mode_handler = WatchModeHandler()
project_watcher_handler = ProjectWatcherHandler()
watch_orchestrator = WatchOrchestrator(
    watch_handler=watch_mode_handler,
    project_handler=project_watcher_handler,
)

# Backward-compatible aliases
watcher_manager = watch_orchestrator
ProjectWatcherManager = WatchOrchestrator
watch_directory = watch_project_directory


async def watch_markdown_file(path: Path, custom_css: Path | None = None) -> None:
    """Watch an explicitly configured external Markdown file using safe directory watching."""
    context = resolve_watch_context(doc_path=path, custom_css=custom_css)
    await watch_document(context)


__all__ = [
    "ProjectWatcherHandler",
    "ProjectWatcherManager",
    "WatchModeHandler",
    "WatchOrchestrator",
    "project_watcher_handler",
    "watch_directory",
    "watch_document",
    "watch_markdown_file",
    "watch_mode_handler",
    "watch_orchestrator",
    "watcher_manager",
]
