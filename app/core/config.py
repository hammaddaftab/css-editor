"""
Application configuration loaded from environment variables / .env file.

Prefix all env vars with EDITOR_ (e.g. EDITOR_WATCH_FILE=/path/to/file.md).
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDITOR_")

    app_name: str = "CSS Markdown Editor"
    debug: bool = False
    # Optional: path to a markdown file to watch on disk and live-reload on change
    watch_file: Path | None = None


settings = Settings()
