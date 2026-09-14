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
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import documents, export, images, pages, render, settings as settings_router, sse
from app.services.watcher import watch_markdown_file, watcher_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Start background tasks on startup; cancel them cleanly on shutdown."""
    tasks: list[asyncio.Task] = []
    projects_root = settings.projects_path
    projects_root.mkdir(parents=True, exist_ok=True)

    # Start project directory watcher using manager so it can be dynamically switched
    watcher_manager.start(projects_root)

    # Optional: watch an explicitly configured external Markdown file
    watch_file = settings.watch_file_path
    if watch_file and watch_file.exists():
        try:
            if watch_file.parent != settings.workspace_path:
                tasks.append(
                    asyncio.create_task(
                        watch_markdown_file(watch_file),
                        name="markdown-file-watcher",
                    )
                )
        except Exception:
            pass

    yield  # application runs here

    await watcher_manager.stop()
    for task in tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.app_name,
    description="Live markdown editor with CSS customisation and PDF export.",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=settings.static_path), name="static")

for _router in (pages.router, render.router, export.router, sse.router, images.router, documents.router, settings_router.router):
    app.include_router(_router)
