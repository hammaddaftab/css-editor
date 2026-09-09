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
from app.routers import documents, export, images, pages, render, sse
from app.services.watcher import watch_directory, watch_markdown_file


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Start background tasks on startup; cancel them cleanly on shutdown."""
    tasks: list[asyncio.Task] = []
    cwd = Path.cwd().resolve()

    # Automatically watch local persisted files in the current working directory
    tasks.append(
        asyncio.create_task(
            watch_directory(cwd),
            name="local-directory-watcher",
        )
    )

    # Optional: watch an external markdown file outside CWD if configured
    if settings.watch_file and settings.watch_file.exists():
        try:
            if settings.watch_file.resolve().parent != cwd:
                tasks.append(
                    asyncio.create_task(
                        watch_markdown_file(settings.watch_file),
                        name="markdown-file-watcher",
                    )
                )
        except Exception:
            pass

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

for _router in (pages.router, render.router, export.router, sse.router, images.router, documents.router):
    app.include_router(_router)
