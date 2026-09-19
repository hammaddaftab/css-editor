"""
FastAPI application factory.

Responsibilities:
  - Mount /static files
  - Register all routers
  - Start/stop background tasks via the lifespan context manager
    (optional disk-file watcher, if EDITOR_WATCH_FILE is configured)
"""
import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import assets, documents, export, images, pages, render, settings as settings_router, sse, telemetry
from app.services.config_manager import get_projects_root
from app.services.watcher import watch_orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Start background tasks on startup; cancel them cleanly on shutdown."""
    projects_root = get_projects_root()
    projects_root.mkdir(parents=True, exist_ok=True)
    watch_orchestrator.start(projects_root)

    # Track app_opened event on application launch
    try:
        telemetry.track_backend_event("app_opened", {"app_name": settings.app_name})
    except Exception:
        pass

    # Orchestrator detects whether watch mode was activated via CLI flag (-w / --watch)
    watch_file = getattr(app.state, "initial_watch_file", None)
    if watch_file:
        await watch_orchestrator.detect_cli_watch(watch_file)

    yield  # application runs here

    # Both WatchModeHandler and ProjectWatcherHandler clean up contained in themselves!
    await watch_orchestrator.shutdown()


app = FastAPI(
    title=settings.app_name,
    description="Live markdown editor with CSS customisation and PDF export.",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=settings.static_path), name="static")

for _router in (pages.router, render.router, export.router, sse.router, images.router, assets.router, documents.router, settings_router.router, telemetry.router):
    app.include_router(_router)
