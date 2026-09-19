"""Application configuration and bundle path resolution.

Handles immutable application-level settings (such as static/template bundle directories
and debug flags) loaded from environment variables.

For mutable user preferences and project directory configurations,
see app.services.config_manager.
"""
from __future__ import annotations

import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def get_bundle_dir() -> Path:
    """Return root directory containing bundled static files and templates.

    When running as a compiled standalone binary (PyInstaller), returns sys._MEIPASS.
    In development mode, returns the repository root.
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
    bundle_dir: Path = APP_ROOT

    @property
    def static_path(self) -> Path:
        return self.bundle_dir / "static"

    @property
    def templates_path(self) -> Path:
        return self.bundle_dir / "templates"

    @property
    def workspace_path(self) -> Path:
        """Alias for bundle_dir retained for backwards compatibility."""
        return self.bundle_dir

    @property
    def projects_path(self) -> Path:
        """Proxy to active projects root from user config."""
        from app.services.config_manager import get_projects_root
        return get_projects_root()


settings = Settings()
