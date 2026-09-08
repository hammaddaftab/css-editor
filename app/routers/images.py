"""
Image upload endpoint — POST /api/images

Accepts a multipart file upload, saves it to static/images/, and returns
the path that can be used directly in markdown:

    ![My image](/static/images/photo.jpg)

The /static/ directory is already served by FastAPI's StaticFiles mount,
so uploaded images are immediately available in both the browser preview
and WeasyPrint PDF export (via base_url resolution).
"""
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["images"])

# Images land here — served by FastAPI's existing /static mount
IMAGES_DIR = Path("static/images")
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Allowed MIME types → file extensions
_ALLOWED: dict[str, str] = {
    "image/jpeg":  ".jpg",
    "image/png":   ".png",
    "image/gif":   ".gif",
    "image/webp":  ".webp",
    "image/svg+xml": ".svg",
}

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/images", summary="Upload an image for use in markdown")
async def upload_image(file: UploadFile) -> JSONResponse:
    # Validate MIME type
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in _ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{content_type}'. "
                   f"Allowed: {', '.join(_ALLOWED)}",
        )

    # Determine extension from MIME type (ignore client-supplied extension)
    ext = _ALLOWED[content_type]

    # Sanitise original filename for display; use UUID for the actual path
    original_stem = Path(file.filename or "image").stem[:64]
    unique_name   = f"{uuid.uuid4().hex}{ext}"
    dest          = IMAGES_DIR / unique_name

    # Read with size guard
    data = await file.read(_MAX_BYTES + 1)
    if len(data) > _MAX_BYTES:
        raise HTTPException(413, detail="File exceeds 10 MB limit.")

    dest.write_bytes(data)

    url  = f"/static/images/{unique_name}"
    md   = f"![{original_stem}]({url})"

    return JSONResponse({
        "url":      url,
        "markdown": md,   # ready-to-paste markdown snippet
        "filename": unique_name,
    })


@router.delete("/images/{filename}", summary="Delete an uploaded image")
async def delete_image(filename: str) -> JSONResponse:
    # Prevent path traversal
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    path = IMAGES_DIR / filename
    if not path.exists():
        raise HTTPException(404, detail="Image not found.")

    path.unlink()
    return JSONResponse({"deleted": filename})
