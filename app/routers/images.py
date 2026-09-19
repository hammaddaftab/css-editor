"""Images router — document-scoped asset management.

Supports:
- Document-scoped image uploads via smart content-hash matching (POST /api/images?doc=...).
- Discovered and referenced document images listing (GET /api/images?doc=...).
- Serving and deleting document images (GET/DELETE /api/images/{filename}?doc=...).
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.routers.assets import encode_doc_token
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


def _resolve_document_images_dir(doc: str) -> Path:
    """Resolve images directory for a given document path."""
    clean = (doc or "").strip()
    if not clean:
        raise HTTPException(status_code=422, detail="'doc' parameter is required.")
    doc_path = Path(clean).resolve()
    images_dir = doc_path.parent / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    return images_dir


@router.get("/images", summary="List images for a document")
async def list_images(
    doc: str = Query(description="Document path"),
) -> JSONResponse:
    doc_path = Path(doc).resolve()
    if not doc_path.is_file() and not doc_path.parent.exists():
        return JSONResponse([])
    images = list_document_images(doc_path)
    return JSONResponse(images)


@router.post("/images", summary="Upload an image for use in a document")
async def upload_image(
    file: UploadFile,
    doc: str = Query(description="Document path"),
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


@router.get("/images/{filename}", summary="Serve an uploaded image")
async def serve_image(
    filename: str,
    doc: str = Query(description="Document path"),
) -> FileResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory = _resolve_document_images_dir(doc)
    path = directory / filename
    if not path.is_file():
        raise HTTPException(404, detail="Image not found.")
    return FileResponse(path)


@router.delete("/images/{filename}", summary="Delete an uploaded image")
async def delete_image(
    filename: str,
    doc: str = Query(description="Document path"),
) -> JSONResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory = _resolve_document_images_dir(doc)
    path = directory / filename
    if not path.exists():
        raise HTTPException(404, detail="Image not found.")

    path.unlink()
    return JSONResponse({"deleted": filename})
