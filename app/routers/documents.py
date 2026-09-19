"""Documents router — unified document loading, saving, and workspace discovery.

Supports both:
- Unified document endpoints (/api/document) accepting TargetSpec (mode='watch' | mode='project').
- Legacy endpoints for backward compatibility with existing frontend and tests.
"""
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.models.context import ProjectTarget, WatchTarget
from app.routers.assets import encode_doc_token
from app.services.context_svc import resolve_document_context
from app.services.document_svc import read_document_io, write_document_io

router = APIRouter(prefix="/api", tags=["documents"])


def get_projects_root() -> Path:
    """Return active projects root directory."""
    root = settings.projects_path
    root.mkdir(parents=True, exist_ok=True)
    return root


# ── Request / Response Models ──────────────────────────────────────────────────


class SaveUnifiedDocumentRequest(BaseModel):
    mode: Literal["watch", "project"] = Field(default="watch", description="Active editing mode")
    path: Path | None = Field(default=None, description="Absolute Markdown path for watch mode")
    custom_css: Path | None = Field(default=None, description="Custom CSS path for watch mode")
    project: str | None = Field(default=None, description="Project directory name for project mode")
    filename: str | None = Field(default=None, description="Document filename for project mode")
    markdown: str = Field(default="", description="Markdown text")
    css: str = Field(default="", description="CSS text")


class SaveDocumentRequest(BaseModel):
    filename: str = Field(default="document.md", description="Target Markdown filename within the project")
    markdown: str = Field(default="", description="Markdown content")
    css: str = Field(default="", description="Companion CSS content")


class ProjectDocumentRequest(SaveDocumentRequest):
    project: str = Field(description="Project directory name")


class CreateProjectRequest(BaseModel):
    name: str = Field(description="Project directory name")


# ── Legacy Project Helpers ────────────────────────────────────────────────────


def resolve_project(project: str) -> Path:
    """Resolve a project as a direct, non-hidden child of projects/."""
    clean = (project or "").strip()
    if not clean or clean in {".", ".."} or "/" in clean or "\\" in clean:
        raise HTTPException(status_code=400, detail="Invalid project name.")

    root = get_projects_root()
    path = (root / clean).resolve()
    if not path.is_dir() or not path.is_relative_to(root) or clean.startswith("."):
        raise HTTPException(status_code=404, detail="Project not found.")
    return path


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


def resolve_project_file(project_path: Path, filename: str) -> Path:
    """Resolve a Markdown file without allowing traversal outside its project."""
    clean = (filename or "").strip()
    if not clean or Path(clean).is_absolute():
        raise HTTPException(status_code=400, detail="Invalid document filename.")
    path = (project_path / clean).resolve()
    if not path.is_relative_to(project_path) or path.suffix.lower() != ".md":
        raise HTTPException(status_code=400, detail="Project documents must be Markdown files.")
    if any(part.startswith(".") for part in path.relative_to(project_path).parts):
        raise HTTPException(status_code=400, detail="Hidden project paths are not allowed.")
    return path


# ── Unified Endpoints (Phase 2) ────────────────────────────────────────────────


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
async def save_document(req: SaveUnifiedDocumentRequest) -> JSONResponse:
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
async def get_workspace() -> JSONResponse:
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
    return JSONResponse({"projects": projects})


# ── Backward Compatibility Endpoints ──────────────────────────────────────────


@router.get("/projects", summary="List filesystem-backed projects (Legacy)")
async def list_projects() -> JSONResponse:
    projects = []
    root = get_projects_root()
    for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_dir() or path.name.startswith(".") or not path.resolve().is_relative_to(root):
            continue
        documents = scan_project_documents(path)
        if documents:
            projects.append({"name": path.name, "documents": len(documents)})
    return JSONResponse({"projects": projects})


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


@router.get("/project/document", summary="Load a document from a project (Legacy)")
async def load_project_document(project: str, filename: str = "README.md") -> JSONResponse:
    project_path = resolve_project(project)
    path = resolve_project_file(project_path, filename)
    css_path = path.with_suffix(".css")
    project_css_path = project_path / "project.css"
    rel_filename = path.relative_to(project_path).as_posix()

    return JSONResponse({
        "project": project,
        "filename": rel_filename,
        "markdown": path.read_text(encoding="utf-8") if path.exists() else "",
        "css": css_path.read_text(encoding="utf-8") if css_path.exists() else "",
        "project_css": project_css_path.read_text(encoding="utf-8") if project_css_path.exists() else "",
        "exists": path.exists(),
        "mtime": path.stat().st_mtime if path.exists() else None,
    })


@router.post("/project/document", summary="Save a document in a project (Legacy)")
async def save_project_document(req: ProjectDocumentRequest) -> JSONResponse:
    project_path = resolve_project(req.project)
    path = resolve_project_file(project_path, req.filename)
    css_path = path.with_suffix(".css")
    write_document_io(path, req.markdown, req.css, css_path)
    return JSONResponse({"saved": True, "project": req.project, "filename": path.relative_to(project_path).as_posix()})


@router.get("/project/documents", summary="List Markdown documents in a project (Legacy)")
async def list_project_documents(project: str) -> JSONResponse:
    return JSONResponse({"files": scan_project_documents(resolve_project(project))})
