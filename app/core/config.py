"""
Application configuration loaded from environment variables / .env file.

Prefix all env vars with EDITOR_ (e.g. EDITOR_WATCH_FILE=/path/to/file.md).
"""
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDITOR_")

    app_name: str = "CSS Markdown Editor"
    debug: bool = False
    # Optional: path to a markdown file to watch on disk and live-reload on change
    watch_file: Path | None = None

    # Paths (relative to root CWD) to include in watching, listing, and editing.
    # "." represents the workspace root itself.
    include_paths: list[str] = [".", "dsa-1"]

    @field_validator("include_paths", mode="before")
    @classmethod
    def parse_include_paths(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            items = [item.strip() for item in v.split(",") if item.strip()]
            return items if items else ["."]
        if isinstance(v, (list, tuple, set)):
            items = [str(item).strip() for item in v if str(item).strip()]
            return items if items else ["."]
        return ["."]


settings = Settings()
