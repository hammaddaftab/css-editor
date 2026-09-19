"""
Settings router — configure user preferences, projects directory, and author information.
"""
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.config_manager import (
    UserConfig,
    get_app_projects_dir,
    get_config_file_path,
    get_default_projects_dir,
    load_user_config,
    save_user_config,
    seed_welcome_project,
)
from app.services.system_dialog import is_dialog_supported, pick_directory, pick_file
from app.services.watcher import watch_orchestrator

router = APIRouter(prefix="/api", tags=["settings"])


class UpdateConfigRequest(BaseModel):
    projects_dir: str | None = Field(default=None, description="Directory where projects are saved")
    author_name: str | None = Field(default=None, description="Default author name for exports")
    author_email: str | None = Field(default=None, description="Default author email")
    first_run_completed: bool | None = Field(default=None, description="Flag indicating first-run setup is done")


def serialize_config(config: UserConfig) -> dict:
    projects_path = Path(config.projects_dir).expanduser().resolve()
    return {
        "projects_dir": str(projects_path),
        "default_projects_dir": str(get_default_projects_dir()),
        "app_projects_dir": str(get_app_projects_dir()),
        "author_name": config.author_name,
        "author_email": config.author_email,
        "first_run_completed": config.first_run_completed,
        "welcome_seeded": config.welcome_seeded,
        "is_first_run": not config.first_run_completed,
        "config_file_path": str(get_config_file_path()),
        "projects_dir_exists": projects_path.is_dir(),
        "dialog_supported": is_dialog_supported(),
        "anonymous_id": config.anonymous_id,
    }


@router.get("/config", summary="Get application and user configuration")
async def get_config() -> JSONResponse:
    config, _ = load_user_config()
    get_config_file_path().parent.mkdir(parents=True, exist_ok=True)
    return JSONResponse(serialize_config(config))


@router.post("/config", summary="Update application and user configuration")
async def update_config(req: UpdateConfigRequest) -> JSONResponse:
    config, _ = load_user_config()

    if req.projects_dir is not None:
        raw_path = req.projects_dir.strip()
        if not raw_path:
            raise HTTPException(status_code=400, detail="Projects directory path cannot be empty.")
        try:
            target_path = Path(raw_path).expanduser().resolve()
            target_path.mkdir(parents=True, exist_ok=True)
            # Switch file watcher to the new target
            watch_orchestrator.switch_projects_root(target_path)
            config.projects_dir = str(target_path)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid projects directory: {exc}")

    if req.author_name is not None:
        config.author_name = req.author_name.strip()

    if req.author_email is not None:
        config.author_email = req.author_email.strip()

    if req.first_run_completed is not None:
        config.first_run_completed = req.first_run_completed

    # Seed the starter welcome project strictly once during initial setup
    if not config.welcome_seeded:
        active_projects_dir = Path(config.projects_dir).expanduser().resolve()
        active_projects_dir.mkdir(parents=True, exist_ok=True)
        seed_welcome_project(active_projects_dir)
        config.welcome_seeded = True

    save_user_config(config)
    return JSONResponse(serialize_config(config))


class BrowseDirectoryRequest(BaseModel):
    initial_dir: str | None = Field(default=None, description="Initial directory to open dialog in")


@router.post("/system/browse-directory", summary="Open native OS folder picker dialog")
async def browse_directory(req: BrowseDirectoryRequest | None = None) -> JSONResponse:
    initial = req.initial_dir if req else None
    path, reason = await pick_directory(initial)
    return JSONResponse({
        "path": path,
        "cancelled": path is None,
        "reason": reason,
    })


class BrowseFileRequest(BaseModel):
    initial_path: str | None = Field(default=None, description="Initial file path or directory to open dialog in")


@router.post("/system/browse-file", summary="Open native OS file picker dialog for Markdown files")
async def browse_file(req: BrowseFileRequest | None = None) -> JSONResponse:
    initial = req.initial_path if req else None
    path, reason = await pick_file(initial)
    return JSONResponse({
        "path": path,
        "cancelled": path is None,
        "reason": reason,
    })
