"""Documents router — unified document loading, saving, and workspace discovery.

Uses discriminated TargetSpec (WatchTarget vs ProjectTarget) to ensure strict mode isolation.
Standard Markdown files and CSS are read and saved safely without side effects or style leakage.
"""
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.context import ProjectTarget, WatchTarget
from app.routers.assets import encode_doc_token
from app.services.config_manager import get_projects_root
from app.services.context_svc import resolve_document_context
from app.services.document_svc import read_document_io, write_document_io
from app.services.watcher import watch_orchestrator

router = APIRouter(prefix="/api", tags=["documents"])


# ── Request / Response Schemas ────────────────────────────────────────────────


class SaveDocumentRequest(BaseModel):
    mode: Literal["watch", "project"] = Field(default="watch", description="Active editing mode")
    path: Path | None = Field(default=None, description="Absolute Markdown path for watch mode")
    custom_css: Path | None = Field(default=None, description="Custom CSS path for watch mode")
    project: str | None = Field(default=None, description="Project directory name for project mode")
    filename: str | None = Field(default=None, description="Document filename for project mode")
    markdown: str = Field(default="", description="Markdown text")
    css: str = Field(default="", description="CSS text")


class CreateProjectRequest(BaseModel):
    name: str = Field(description="Project directory name")


# ── Workspace Scanner Helper ──────────────────────────────────────────────────


def scan_project_documents(project_path: Path) -> list[dict]:
    """List Markdown files belonging to one project, recursively."""
    files = []
    for path in sorted(project_path.rglob("*.md")):
        if not path.is_file() or any(part.startswith(".") for part in path.relative_to(project_path).parts):
            continue
        stat = path.stat()
        files.append({
            "filename": path.relative_to(project_path).as_posix(),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
        })
    return files


# ── Unified Endpoints ──────────────────────────────────────────────────────────


@router.get("/document", summary="Load a document using unified TargetSpec")
async def load_document(
    mode: Literal["watch", "project"] = Query(default="watch"),
    path: str | None = Query(default=None, description="Absolute Markdown path for watch mode"),
    custom_css: str | None = Query(default=None, description="Custom CSS path for watch mode"),
    project: str | None = Query(default=None, description="Project name for project mode"),
    filename: str | None = Query(default=None, description="Filename for project mode"),
) -> JSONResponse:
    projects_root = get_projects_root()

    try:
        if mode == "watch":
            if not path:
                raise HTTPException(status_code=400, detail="path parameter is required for watch mode.")
            target = WatchTarget(
                doc_path=Path(path),
                custom_css=Path(custom_css) if custom_css else None,
            )
            context = resolve_document_context(target)
        else:
            if not project:
                raise HTTPException(status_code=400, detail="project parameter is required for project mode.")
            target = ProjectTarget(
                project_name=project,
                filename=filename or "README.md",
            )
            context = resolve_document_context(target, projects_root=projects_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    markdown, css, mtime = read_document_io(context.doc_path, context.css_path)
    shared_css = None

    if context.mode == "project" and context.project_css_path and context.project_css_path.is_file():
        shared_css = context.project_css_path.read_text(encoding="utf-8")

    doc_token = encode_doc_token(context.doc_path.parent)
    await watch_orchestrator.detect_and_activate(context)

    return JSONResponse({
        "doc_path": str(context.doc_path),
        "filename": context.doc_path.name,
        "mode": context.mode,
        "markdown": markdown,
        "css": css,
        "shared_css": shared_css,
        "doc_token": doc_token,
        "exists": context.doc_path.is_file(),
        "mtime": mtime,
    })


@router.post("/document", summary="Save a document using unified TargetSpec")
async def save_document(req: SaveDocumentRequest) -> JSONResponse:
    projects_root = get_projects_root()

    try:
        if req.mode == "watch":
            if not req.path:
                raise HTTPException(status_code=400, detail="path field is required for watch mode.")
            target = WatchTarget(
                doc_path=req.path,
                custom_css=req.custom_css,
            )
            context = resolve_document_context(target)
        else:
            if not req.project:
                raise HTTPException(status_code=400, detail="project field is required for project mode.")
            target = ProjectTarget(
                project_name=req.project,
                filename=req.filename or "README.md",
            )
            context = resolve_document_context(target, projects_root=projects_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_document_io(context.doc_path, req.markdown, req.css, context.css_path)
    mtime = context.doc_path.stat().st_mtime if context.doc_path.is_file() else None

    return JSONResponse({
        "saved": True,
        "doc_path": str(context.doc_path),
        "mtime": mtime,
    })


@router.get("/workspace", summary="Discover workspace projects and files")
async def get_workspace(request: Request) -> JSONResponse:
    projects = []
    root = get_projects_root()
    for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_dir() or path.name.startswith(".") or not path.resolve().is_relative_to(root):
            continue
        documents = scan_project_documents(path)
        if documents:
            projects.append({
                "name": path.name,
                "path": str(path),
                "documents": documents,
            })

    active_watch = None
    watch_file = getattr(request.app.state, "initial_watch_file", None)
    if watch_file and isinstance(watch_file, Path) and watch_file.is_file():
        active_watch = {
            "path": str(watch_file),
            "filename": watch_file.name,
        }

    return JSONResponse({
        "projects": projects,
        "active_watch_target": active_watch,
    })


@router.post("/projects", summary="Create a filesystem-backed project")
async def create_project(req: CreateProjectRequest) -> JSONResponse:
    name = req.name.strip()
    if not name or name in {".", ".."} or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid project name.")
    if name in {"app", "frontend", "static", "templates", "tmp_dont_touch"}:
        raise HTTPException(status_code=400, detail="That directory name is reserved.")

    root = get_projects_root()
    project_path = (root / name).resolve()
    if not project_path.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Invalid project name.")
    if project_path.exists():
        raise HTTPException(status_code=409, detail="A project with that name already exists.")
    project_path.mkdir(parents=True)
    (project_path / "images").mkdir(parents=True, exist_ok=True)
    (project_path / "README.md").write_text(f"# {name}\n\n", encoding="utf-8")
    return JSONResponse({"created": True, "name": name}, status_code=201)
