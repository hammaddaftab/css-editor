"""
Application configuration loaded from environment variables / .env file.

Prefix all env vars with EDITOR_ (e.g. EDITOR_WATCH_FILE=/path/to/file.md).
"""
import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def get_bundle_dir() -> Path:
    """
    Return the root directory containing bundled static files and templates.
    When running as a compiled standalone binary (PyInstaller), returns sys._MEIPASS.
    In standard development mode, returns the repository root.
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS).resolve()
    return Path(__file__).resolve().parents[2]


APP_ROOT = get_bundle_dir()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="EDITOR_",
        env_ignore_empty=True,
    )

    app_name: str = "CSS Markdown Editor"
    debug: bool = False
    workspace_root: Path = APP_ROOT
    # Optional: path to a markdown file to watch on disk and live-reload on change
    watch_file: Path | None = None

    def _resolve_path(self, value: Path, base: Path = APP_ROOT) -> Path:
        path = value.expanduser()
        if not path.is_absolute():
            path = base / path
        return path.resolve()

    @property
    def workspace_path(self) -> Path:
        return self._resolve_path(self.workspace_root)

    @property
    def projects_path(self) -> Path:
        from app.services.config_manager import get_projects_root
        return get_projects_root()

    @property
    def static_path(self) -> Path:
        return self.workspace_path / "static"

    @property
    def templates_path(self) -> Path:
        return self.workspace_path / "templates"

    @property
    def watch_file_path(self) -> Path | None:
        return self._resolve_path(self.watch_file, self.workspace_path) if self.watch_file else None


settings = Settings()
