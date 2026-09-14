"""
Documents router — save and load project Markdown and CSS files.

Security:
  Project paths are restricted strictly to the configured projects directory
  (no path traversal, no hidden files).
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/api", tags=["documents"])


def get_projects_root() -> Path:
    """Return active projects root directory."""
    root = settings.projects_path
    root.mkdir(parents=True, exist_ok=True)
    return root


class SaveDocumentRequest(BaseModel):
    filename: str = Field(default="document.md", description="Target Markdown filename within the project")
    markdown: str = Field(default="", description="Markdown content")
    css: str = Field(default="", description="Companion CSS content")


class ProjectDocumentRequest(SaveDocumentRequest):
    project: str = Field(description="Project directory name")


class CreateProjectRequest(BaseModel):
    name: str = Field(description="Project directory name")


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


@router.get("/projects", summary="List filesystem-backed projects")
async def list_projects() -> JSONResponse:
    projects = []
    root = get_projects_root()
    for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
        if (
            not path.is_dir()
            or path.name.startswith(".")
            or not path.resolve().is_relative_to(root)
        ):
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


@router.get("/project/document", summary="Load a document from a project")
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


@router.post("/project/document", summary="Save a document in a project")
async def save_project_document(req: ProjectDocumentRequest) -> JSONResponse:
    project_path = resolve_project(req.project)
    path = resolve_project_file(project_path, req.filename)
    css_path = path.with_suffix(".css")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(req.markdown, encoding="utf-8")
    css_path.write_text(req.css, encoding="utf-8")
    return JSONResponse({"saved": True, "project": req.project, "filename": path.relative_to(project_path).as_posix()})


@router.get("/project/documents", summary="List Markdown documents in a project")
async def list_project_documents(project: str) -> JSONResponse:
    return JSONResponse({"files": scan_project_documents(resolve_project(project))})
