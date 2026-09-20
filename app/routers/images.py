"""Images router — document-scoped asset management.

Supports:
- Document-scoped image uploads via smart content-hash matching (POST /api/images?doc=...).
- Discovered and referenced document images listing (GET /api/images?doc=...).
- Serving and deleting document images (GET/DELETE /api/images/{filename}?doc=...).
"""
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.routers.assets import encode_doc_token
from app.services.asset_svc import (
    _ALLOWED_IMAGE_EXTS,
    list_document_images,
    save_or_match_image,
)
from app.services.config_manager import get_projects_root

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


def _resolve_document_images_dir(doc: str | None = None, project: str | None = None) -> Path:
    """Resolve images directory for a given document path or project name."""
    if doc and doc.strip():
        doc_path = Path(doc.strip()).resolve()
        images_dir = doc_path.parent / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        return images_dir
    if project and project.strip():
        images_dir = get_projects_root() / project.strip() / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        return images_dir
    raise HTTPException(status_code=422, detail="Either 'doc' or 'project' parameter is required.")


@router.get("/images", summary="List images for a document")
async def list_images(
    doc: str | None = Query(default=None, description="Document path"),
    project: str | None = Query(default=None, description="Project name"),
) -> JSONResponse:
    if doc and doc.strip():
        doc_path = Path(doc.strip()).resolve()
        if not doc_path.is_file() and not doc_path.parent.exists():
            return JSONResponse([])
        images = list_document_images(doc_path)
        return JSONResponse(images)
    if project and project.strip():
        proj_dir = get_projects_root() / project.strip()
        dummy_doc = proj_dir / "README.md"
        images = list_document_images(dummy_doc)
        return JSONResponse(images)
    raise HTTPException(status_code=422, detail="Either 'doc' or 'project' parameter is required.")


@router.post("/images", summary="Upload an image for use in a document")
async def upload_image(
    file: UploadFile,
    doc: str | None = Query(default=None, description="Document path"),
    project: str | None = Query(default=None, description="Project name"),
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
    if doc and doc.strip():
        doc_path = Path(doc.strip()).resolve()
    elif project and project.strip():
        doc_path = get_projects_root() / project.strip() / "README.md"
    else:
        raise HTTPException(status_code=422, detail="Either 'doc' or 'project' parameter is required.")

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


@router.get("/images/{filename}", summary="Serve an uploaded image")
async def serve_image(
    filename: str,
    doc: str | None = Query(default=None, description="Document path"),
    project: str | None = Query(default=None, description="Project name"),
) -> FileResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory = _resolve_document_images_dir(doc=doc, project=project)
    path = directory / filename
    if not path.is_file():
        raise HTTPException(404, detail="Image not found.")
    return FileResponse(path)


@router.delete("/images/{filename}", summary="Delete an uploaded image")
async def delete_image(
    filename: str,
    doc: str | None = Query(default=None, description="Document path"),
    project: str | None = Query(default=None, description="Project name"),
) -> JSONResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory = _resolve_document_images_dir(doc=doc, project=project)
    path = directory / filename
    if not path.exists():
        raise HTTPException(404, detail="Image not found.")

    path.unlink()
    return JSONResponse({"deleted": filename})


class RenameImageRequest(BaseModel):
    new_filename: str


@router.patch("/images/{filename}", summary="Rename an uploaded image")
@router.post("/images/{filename}/rename", summary="Rename an uploaded image")
async def rename_image(
    filename: str,
    req: RenameImageRequest,
    doc: str | None = Query(default=None, description="Document path"),
    project: str | None = Query(default=None, description="Project name"),
) -> JSONResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid source filename.")

    new_filename = req.new_filename.strip()
    if not new_filename or "/" in new_filename or "\\" in new_filename or new_filename.startswith("."):
        raise HTTPException(400, detail="Invalid target filename.")

    # Preserve or validate extension
    old_ext = Path(filename).suffix.lower()
    new_ext = Path(new_filename).suffix.lower()
    if not new_ext:
        new_filename = f"{new_filename}{old_ext}"
        new_ext = old_ext

    if new_ext not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(400, detail=f"Unsupported file extension '{new_ext}'.")

    directory = _resolve_document_images_dir(doc=doc, project=project)
    src_path = directory / filename
    if not src_path.is_file():
        if doc and doc.strip():
            doc_parent = Path(doc.strip()).resolve().parent
            alt_src = doc_parent / filename
            if alt_src.is_file():
                src_path = alt_src
                directory = doc_parent

    if not src_path.is_file():
        raise HTTPException(404, detail="Image not found.")

    dest_path = directory / new_filename
    if dest_path.resolve() != src_path.resolve() and dest_path.exists():
        raise HTTPException(409, detail=f"File '{new_filename}' already exists.")

    if dest_path.resolve() != src_path.resolve():
        src_path.rename(dest_path)

    if doc and doc.strip():
        doc_dir = Path(doc.strip()).resolve().parent
    elif project and project.strip():
        doc_dir = get_projects_root() / project.strip()
    else:
        doc_dir = directory.parent

    token = encode_doc_token(doc_dir)
    rel = os.path.relpath(dest_path, doc_dir).replace("\\", "/")
    if not rel.startswith("."):
        rel = f"./{rel}"
    clean_url_rel = rel.lstrip("./")
    new_url = f"/api/assets/{token}/{clean_url_rel}"

    return JSONResponse({
        "old_filename": filename,
        "filename": new_filename,
        "rel_path": rel,
        "url": new_url,
    })

