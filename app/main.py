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
from app.routers import export, images, pages, render, sse


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Start background tasks on startup; cancel them cleanly on shutdown."""
    tasks: list[asyncio.Task] = []

    if settings.watch_file and settings.watch_file.exists():
        from app.services.watcher import watch_markdown_file

        task = asyncio.create_task(
            watch_markdown_file(settings.watch_file),
            name="markdown-file-watcher",
        )
        tasks.append(task)

    yield  # application runs here

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

app.mount("/static", StaticFiles(directory="static"), name="static")

for _router in (pages.router, render.router, export.router, sse.router, images.router):
    app.include_router(_router)
