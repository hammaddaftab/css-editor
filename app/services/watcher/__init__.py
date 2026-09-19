"""Watcher subsystem package.

Layers:
1. WatchOrchestrator: Pure detection of watch mode (CLI flag or frontend call) & coordination.
2. WatchModeHandler: Standalone document watch layer with self-contained cleanup.
3. ProjectWatcherHandler: Project watch layer watching respective project only with self-contained cleanup.
"""
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

__all__ = [
    "ProjectWatcherHandler",
    "WatchModeHandler",
    "WatchOrchestrator",
    "project_watcher_handler",
    "watch_document",
    "watch_mode_handler",
    "watch_orchestrator",
    "watch_project_directory",
]
