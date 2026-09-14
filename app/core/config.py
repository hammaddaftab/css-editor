"""
Application configuration loaded from environment variables / .env file.

Prefix all env vars with EDITOR_ (e.g. EDITOR_WATCH_FILE=/path/to/file.md).
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="EDITOR_",
        env_ignore_empty=True,
    )

    app_name: str = "CSS Markdown Editor"
    debug: bool = False
    # Installation/repository root. Relative paths are resolved from APP_ROOT,
    # never from the process's current working directory.
    workspace_root: Path = APP_ROOT
    projects_dir: Path = Path("projects")
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
        return self._resolve_path(self.projects_dir, self.workspace_path)

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
