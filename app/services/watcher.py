"""
File-system watcher service.

Uses watchfiles (async-native) to monitor a markdown file on disk.
When the file changes, it re-renders the content and broadcasts an SSE
render event to all connected clients.

Run this as a background asyncio.Task via the app lifespan.
"""
from pathlib import Path

from watchfiles import awatch

from app.services.broadcaster import broadcaster
from app.services.markdown_svc import render_markdown


async def watch_markdown_file(path: Path) -> None:
    """
    Watch *path* and broadcast a render SSE event on every change.

    Designed to be cancelled cleanly when the application shuts down.
    """
    async for _ in awatch(path):
        try:
            content = path.read_text(encoding="utf-8")
            html = render_markdown(content)
            await broadcaster.publish("render", {"html": html, "css": ""})
        except Exception as exc:  # noqa: BLE001
            await broadcaster.publish("error", {"message": str(exc)})
