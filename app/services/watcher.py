"""
File-system watcher service.

Uses watchfiles (async-native) to monitor local persisted files (.md and .css)
in configured include directories within the project's working directory.
When files change on disk, it re-renders content and broadcasts SSE events
(both `file:change` and `render`) to all connected clients.

Run this as a background asyncio.Task via the app lifespan.
"""
import asyncio
import logging
from pathlib import Path

from watchfiles import Change, awatch

from app.core.config import settings
from app.services.broadcaster import broadcaster
from app.services.markdown_svc import render_markdown
from app.services.path_svc import (
    get_watch_directories,
    is_watched_file,
    scan_markdown_files,
    to_relative_posix,
)

logger = logging.getLogger(__name__)


async def broadcast_file_list(root_dir: Path) -> None:
    """Scan configured include directories for markdown files and broadcast list to subscribers."""
    try:
        files = scan_markdown_files(root_dir, settings.include_paths)
        await broadcaster.publish("file:list", {"files": files})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to broadcast file list: %s", exc)


async def watch_directory(root_dir: Path) -> None:
    """
    Watch configured include directories for changes to .md and .css files
    and broadcast SSE events using relative POSIX paths.
    """
    root = root_dir.resolve()
    watch_dirs = get_watch_directories(root, settings.include_paths)
    logger.info("Starting local file watcher on included directories: %s", [str(d) for d in watch_dirs])

    if not watch_dirs:
        logger.warning("No valid watch directories found for include_paths: %s", settings.include_paths)
        return

    try:
        async for changes in awatch(*watch_dirs, recursive=False, debounce=300):
            has_list_changes = False

            for change_type, path_str in changes:
                try:
                    p = Path(path_str)
                    if not is_watched_file(p, root, settings.include_paths):
                        continue

                    rel_name = to_relative_posix(p, root)

                    # Handle deletions
                    if change_type == Change.deleted:
                        if p.suffix.lower() == ".md":
                            has_list_changes = True
                            await broadcaster.publish("file:change", {
                                "filename": rel_name,
                                "action": "deleted",
                            })
                        continue

                    # Handle additions and modifications
                    if p.suffix.lower() == ".md":
                        if change_type == Change.added:
                            has_list_changes = True

                        # Small pause to allow atomic writes/renames to finish
                        await asyncio.sleep(0.05)
                        if not p.exists():
                            continue

                        markdown = p.read_text(encoding="utf-8")
                        css_p = p.with_suffix(".css")
                        css = css_p.read_text(encoding="utf-8") if css_p.exists() else ""
                        html = render_markdown(markdown)

                        payload = {
                            "filename": rel_name,
                            "action": "added" if change_type == Change.added else "modified",
                            "markdown": markdown,
                            "css": css,
                            "html": html,
                        }
                        await broadcaster.publish("file:change", payload)
                        await broadcaster.publish("render", {
                            "filename": rel_name,
                            "html": html,
                            "css": css,
                        })

                    elif p.suffix.lower() == ".css":
                        # Companion markdown file
                        md_p = p.with_suffix(".md")
                        if md_p.exists():
                            await asyncio.sleep(0.05)
                            markdown = md_p.read_text(encoding="utf-8")
                            css = p.read_text(encoding="utf-8") if p.exists() else ""
                            html = render_markdown(markdown)
                            md_rel_name = to_relative_posix(md_p, root)

                            payload = {
                                "filename": md_rel_name,
                                "action": "modified",
                                "markdown": markdown,
                                "css": css,
                                "html": html,
                            }
                            await broadcaster.publish("file:change", payload)
                            await broadcaster.publish("render", {
                                "filename": md_rel_name,
                                "html": html,
                                "css": css,
                            })

                except Exception as exc:  # noqa: BLE001
                    logger.exception("Error processing watched file change: %s", exc)

            if has_list_changes:
                await broadcast_file_list(root)

    except asyncio.CancelledError:
        logger.info("Local file watcher cancelled cleanly.")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Local file watcher encountered an error: %s", exc)


async def watch_markdown_file(path: Path) -> None:
    """
    Watch a specific *path* and broadcast changes.

    Designed for explicit single-file watch mode (e.g. EDITOR_WATCH_FILE).
    """
    target = path.resolve()
    logger.info("Starting single-file watcher on %s", target)
    try:
        async for _ in awatch(target, debounce=300):
            try:
                if not target.exists():
                    continue
                content = target.read_text(encoding="utf-8")
                css_path = target.with_suffix(".css")
                css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
                html = render_markdown(content)
                await broadcaster.publish("file:change", {
                    "filename": target.name,
                    "action": "modified",
                    "markdown": content,
                    "css": css,
                    "html": html,
                })
                await broadcaster.publish("render", {
                    "filename": target.name,
                    "html": html,
                    "css": css,
                })
            except Exception as exc:  # noqa: BLE001
                await broadcaster.publish("error", {"message": str(exc)})
    except asyncio.CancelledError:
        raise
