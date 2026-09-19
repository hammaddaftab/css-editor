"""Watcher subsystem facade and backward compatibility module.

Decomposed into three distinct layers:
1. WatchOrchestrator (orchestrator layer whose job is only detecting watch mode via CLI flag or frontend call)
2. WatchModeHandler (layer for handling standalone watch mode itself with self-contained cleanup)
3. ProjectWatcherHandler (project handling layer which watches the respective project only with self-contained cleanup)
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

# Backward-compatible alias
watcher_manager = watch_orchestrator
ProjectWatcherManager = WatchOrchestrator


async def watch_markdown_file(path: Path, custom_css: Path | None = None) -> None:
    """Watch an explicitly configured external Markdown file using safe directory watching."""
    context = resolve_watch_context(doc_path=path, custom_css=custom_css)
    await watch_document(context)


# Alias for backwards compatibility
watch_directory = watch_project_directory

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
