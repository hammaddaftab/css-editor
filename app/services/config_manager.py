"""
Configuration manager for user settings and local projects storage.

Stores global user settings (projects directory, author info, preferences)
in standard OS configuration directories:
  - Linux: ~/.config/css-editor/config.json (or $XDG_CONFIG_HOME)
  - macOS: ~/Library/Application Support/css-editor/config.json
  - Windows: %APPDATA%/css-editor/config.json

Allows overriding via EDITOR_CONFIG_DIR environment variable.
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import shutil
import sys
import uuid
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import get_bundle_dir

logger = logging.getLogger(__name__)

APP_ROOT = get_bundle_dir()


class UserConfig(BaseModel):
    version: int = Field(default=1, description="Config schema version")
    projects_dir: str = Field(description="Absolute path to the directory where projects are stored")
    author_name: str = Field(default="", description="Default document author name")
    author_email: str = Field(default="", description="Default document author email")
    first_run_completed: bool = Field(default=False, description="Whether first-run setup has been completed")
    welcome_seeded: bool = Field(default=False, description="Whether the starter welcome project was seeded")
    anonymous_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Anonymous installation UUID")
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    preview_theme: str = Field(default="light", description="Preview background theme: 'light' or 'dark'")
    library_open: bool = Field(default=True, description="Whether the Image Library tab/panel is expanded")
    css_open: bool = Field(default=True, description="Whether the Custom CSS tab/panel is expanded")
    preview_open: bool = Field(default=True, description="Whether the Preview tab/panel is expanded")
    no_crop: bool = Field(default=False, description="Whether Image Library is in no-crop mode")
    no_whitespace: bool = Field(default=False, description="Whether Image Library is in no-whitespace mode")


def get_user_config_dir() -> Path:
    """Return OS-appropriate directory for application configuration."""
    env_dir = os.environ.get("EDITOR_CONFIG_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()

    if sys.platform.startswith("darwin"):
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME")
        base = Path(xdg) if xdg else Path.home() / ".config"

    return (base / "css-editor").resolve()


def get_config_file_path() -> Path:
    """Return path to config.json."""
    return get_user_config_dir() / "config.json"


def get_default_projects_dir() -> Path:
    """Return recommended default directory for projects: ~/Documents/CSS-Markdown-Editor/projects."""
    docs_dir = Path.home() / "Documents"
    if docs_dir.is_dir():
        return (docs_dir / "CSS-Markdown-Editor" / "projects").resolve()
    return (Path.home() / "CSS-Markdown-Editor" / "projects").resolve()


def get_app_projects_dir() -> Path:
    """Return repository projects/ directory."""
    return (APP_ROOT / "projects").resolve()


_cached_config: UserConfig | None = None
_cached_config_path: Path | None = None


def clear_config_cache() -> None:
    """Clear in-memory cached user config."""
    global _cached_config, _cached_config_path
    _cached_config = None
    _cached_config_path = None


def load_user_config(force_reload: bool = False) -> tuple[UserConfig, bool]:
    """Load user configuration from memory cache or disk.

    Returns (UserConfig, exists_on_disk).
    """
    global _cached_config, _cached_config_path
    config_path = get_config_file_path()
    default_dir = get_default_projects_dir()

    if not force_reload and _cached_config is not None and _cached_config_path == config_path:
        return _cached_config, True

    if not config_path.exists():
        initial = UserConfig(
            projects_dir=str(default_dir),
            first_run_completed=False,
        )
        try:
            save_user_config(initial)
            _cached_config = initial
            _cached_config_path = config_path
            return initial, True
        except Exception as exc:
            logger.warning("Could not persist initial user config to %s (%s).", config_path, exc)
            return initial, False

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        # Ensure projects_dir is populated
        if not raw.get("projects_dir"):
            raw["projects_dir"] = str(default_dir)
        needs_save = False
        if not raw.get("anonymous_id"):
            raw["anonymous_id"] = str(uuid.uuid4())
            needs_save = True
        config = UserConfig(**raw)
        if needs_save:
            save_user_config(config)
        _cached_config = config
        _cached_config_path = config_path
        return config, True
    except Exception as exc:
        logger.warning("Could not read user config from %s (%s). Using defaults.", config_path, exc)
        fallback = UserConfig(projects_dir=str(default_dir), first_run_completed=False)
        _cached_config = fallback
        _cached_config_path = config_path
        return fallback, False


def save_user_config(config: UserConfig) -> None:
    """Save user configuration atomically to disk and update in-memory cache."""
    global _cached_config, _cached_config_path
    config_dir = get_user_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)
    config_path = get_config_file_path()

    config.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    temp_file = config_path.with_suffix(f".tmp.{os.getpid()}")
    try:
        temp_file.write_text(config.model_dump_json(indent=2), encoding="utf-8")
        temp_file.replace(config_path)
        _cached_config = config
        _cached_config_path = config_path
    finally:
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)


def get_projects_root() -> Path:
    """Resolve active projects root directory from user config or environment override."""
    env_override = os.environ.get("EDITOR_PROJECTS_DIR")
    if env_override:
        path = Path(env_override).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path
    config, _ = load_user_config()
    path = Path(config.projects_dir).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


WELCOME_TEMPLATES_DIR = APP_ROOT / "templates" / "welcome"


def seed_welcome_project(projects_root: Path) -> None:
    """Create starter welcome project files in projects_root once from templates/welcome/."""
    welcome_dir = projects_root / "welcome"
    welcome_dir.mkdir(parents=True, exist_ok=True)
    (welcome_dir / "images").mkdir(parents=True, exist_ok=True)

    template_dir = WELCOME_TEMPLATES_DIR
    for name in ("README.md", "project.css", "README.css"):
        src = template_dir / name
        dst = welcome_dir / name
        if src.exists():
            shutil.copy2(src, dst)
        else:
            dst.write_text(f"# {name}\n", encoding="utf-8")


