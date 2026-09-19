"""Images router — document-scoped and project-scoped asset management.

Supports:
- Document-scoped image uploads via smart content-hash matching (POST /api/images?doc=...).
- Discovered and referenced document images listing (GET /api/images?doc=...).
- Backward-compatible project-scoped image management (GET/POST /api/images?project=...).
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.routers.assets import encode_doc_token
from app.routers.documents import resolve_project
from app.services.asset_svc import list_document_images, save_or_match_image

router = APIRouter(prefix="/api", tags=["images"])

# Allowed MIME types → file extensions
_ALLOWED: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/x-icon": ".ico",
}

_MAX_BYTES = 15 * 1024 * 1024  # 15 MB


def resolve_image_dest(
    project: str | None = None,
    doc: str | None = None,
) -> tuple[Path, str]:
    """Resolve directory and query string parameter."""
    if doc:
        doc_path = Path(doc).resolve()
        directory = doc_path.parent / "images"
        directory.mkdir(parents=True, exist_ok=True)
        return directory, f"?doc={doc}"

    if project:
        clean = project.strip()
        if not clean:
            raise HTTPException(status_code=400, detail="Invalid project parameter.")
        directory = resolve_project(clean) / "images"
        directory.mkdir(parents=True, exist_ok=True)
        return directory, f"?project={clean}"

    raise HTTPException(status_code=422, detail="Either 'doc' or 'project' parameter is required.")


@router.get("/images", summary="List images for a document or project")
async def list_images(
    project: str | None = Query(default=None, description="Project name"),
    doc: str | None = Query(default=None, description="Document path"),
) -> JSONResponse:
    if doc:
        doc_path = Path(doc).resolve()
        if not doc_path.is_file():
            # If the file hasn't been saved yet, check parent
            if not doc_path.parent.exists():
                return JSONResponse([])
        images = list_document_images(doc_path)
        return JSONResponse(images)

    if project:
        images = []
        directory, query = resolve_image_dest(project=project)
        if directory.exists():
            for path in sorted(directory.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}:
                    stat = path.stat()
                    images.append({
                        "filename": path.name,
                        "url": f"/api/images/{path.name}{query}",
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    })
        return JSONResponse(images)

    raise HTTPException(status_code=422, detail="Either 'doc' or 'project' parameter is required.")


@router.post("/images", summary="Upload an image for use in a document or project")
async def upload_image(
    file: UploadFile,
    project: str | None = Query(default=None, description="Project name"),
    doc: str | None = Query(default=None, description="Document path"),
) -> JSONResponse:
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in _ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{content_type}'. Allowed: {', '.join(_ALLOWED)}",
        )

    ext = _ALLOWED[content_type]
    data = await file.read(_MAX_BYTES + 1)
    if len(data) > _MAX_BYTES:
        raise HTTPException(413, detail="File exceeds 15 MB limit.")

    original_stem = Path(file.filename or "image").stem[:64]

    # Document-scoped upload with smart hash matching
    if doc:
        doc_path = Path(doc).resolve()
        clean_filename = f"{original_stem}{ext}"
        rel_path, final_filename, is_existing = save_or_match_image(doc_path, clean_filename, data)

        token = encode_doc_token(doc_path.parent)
        clean_url_rel = rel_path.lstrip("./")
        asset_url = f"/api/assets/{token}/{clean_url_rel}"
        markdown_snippet = f"![{original_stem}]({rel_path})"

        return JSONResponse({
            "url": asset_url,
            "rel_path": rel_path,
            "markdown": markdown_snippet,
            "filename": final_filename,
            "is_existing": is_existing,
        })

    # Legacy project-scoped upload
    if project:
        unique_name = f"{uuid.uuid4().hex}{ext}"
        directory, query = resolve_image_dest(project=project)
        dest = directory / unique_name
        dest.write_bytes(data)

        url = f"/api/images/{unique_name}{query}"
        md = f"![{original_stem}]({url})"

        return JSONResponse({
            "url": url,
            "markdown": md,
            "filename": unique_name,
        })

    raise HTTPException(status_code=422, detail="Either 'doc' or 'project' parameter is required.")


@router.get("/images/{filename}", summary="Serve an uploaded image")
async def serve_image(
    filename: str,
    project: str | None = Query(default=None, description="Project name"),
    doc: str | None = Query(default=None, description="Document path"),
) -> FileResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory, _ = resolve_image_dest(project=project, doc=doc)
    path = directory / filename
    if not path.is_file():
        raise HTTPException(404, detail="Image not found.")
    return FileResponse(path)


@router.delete("/images/{filename}", summary="Delete an uploaded image")
async def delete_image(
    filename: str,
    project: str | None = Query(default=None, description="Project name"),
    doc: str | None = Query(default=None, description="Document path"),
) -> JSONResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory, _ = resolve_image_dest(project=project, doc=doc)
    path = directory / filename
    if not path.exists():
        raise HTTPException(404, detail="Image not found.")

    path.unlink()
    return JSONResponse({"deleted": filename})
