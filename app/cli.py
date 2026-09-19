"""
CLI entrypoint for CSS Markdown Editor.

Responsibilities:
  - Parse CLI arguments (--host, --port, --no-browser, --watch, --version)
  - Detect free port if preferred port is occupied
  - Automatically open default web browser (unless --no-browser is passed)
  - Launch Uvicorn server hosting the FastAPI application
"""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

__version__ = "0.1.0"


def find_available_port(host: str = "127.0.0.1", preferred_port: int = 8000) -> int:
    """Return preferred_port if available; otherwise find and return an ephemeral free port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, preferred_port))
            return preferred_port
        except OSError:
            pass

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def open_browser_delayed(url: str, delay: float = 0.8) -> None:
    """Open default web browser after a short delay to allow server to start."""
    time.sleep(delay)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="css-editor",
        description="CSS Markdown Editor — Live markdown editor with CSS customisation and PDF export.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to listen on (default: 8000; finds next available port if occupied)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open web browser automatically",
    )
    parser.add_argument(
        "-w",
        "--watch",
        type=str,
        default=None,
        help="Path to an external markdown file to watch on disk",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    watch_path: Path | None = None
    if args.watch:
        watch_path = Path(args.watch).expanduser().resolve()
        if not watch_path.exists():
            print(f"Error: Specified watch file does not exist: {watch_path}", file=sys.stderr)
            sys.exit(1)

    actual_port = find_available_port(host=args.host, preferred_port=args.port)
    if actual_port != args.port:
        print(f"Notice: Port {args.port} is already in use. Selected available port {actual_port}.")

    # Import app and settings
    from app.core.config import settings
    from app.main import app
    import uvicorn

    if watch_path:
        app.state.initial_watch_file = watch_path

    url = f"http://{args.host}:{actual_port}"

    if not args.no_browser:
        browser_thread = threading.Thread(
            target=open_browser_delayed,
            args=(url,),
            daemon=True,
            name="browser-launcher",
        )
        browser_thread.start()

    print("=" * 60)
    print(f"  🚀 CSS Markdown Editor v{__version__}")
    print(f"  🌐 URL:      {url}")
    print(f"  📁 Projects: {settings.projects_path}")
    print("  ⌨️  Press Ctrl+C to stop the server.")
    print("=" * 60)

    try:
        uvicorn.run(
            app,
            host=args.host,
            port=actual_port,
            log_level="warning" if not settings.debug else "info",
        )
    except (KeyboardInterrupt, SystemExit):
        print("\nShutting down CSS Markdown Editor...")


if __name__ == "__main__":
    main()
