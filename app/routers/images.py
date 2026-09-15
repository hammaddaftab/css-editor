"""
Image upload endpoint — POST /api/images

Images are strictly project-scoped and stored inside <projects_root>/<project>/images/.
Accepts a multipart file upload, saves it to the project's images directory, and returns
the path that can be used directly in markdown:

    ![My image](/api/images/photo.jpg?project=my-project)

Uploaded images are immediately available in both the browser preview
and WeasyPrint PDF export (via base_url resolution).
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.routers.documents import resolve_project

router = APIRouter(prefix="/api", tags=["images"])

# Allowed MIME types → file extensions
_ALLOWED: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def image_directory(project: str) -> tuple[Path, str]:
    """Resolve the images directory for a specific project. Project is strictly required."""
    clean = (project or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Project parameter is required.")
    directory = resolve_project(clean) / "images"
    directory.mkdir(parents=True, exist_ok=True)
    return directory, f"?project={clean}"


@router.get("/images", summary="List all uploaded images for a project")
async def list_images(project: str = Query(..., description="Project name")) -> JSONResponse:
    images = []
    directory, query = image_directory(project)
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


@router.post("/images", summary="Upload an image for use in a project's markdown")
async def upload_image(
    file: UploadFile,
    project: str = Query(..., description="Project name"),
) -> JSONResponse:
    # Validate MIME type
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in _ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{content_type}'. Allowed: {', '.join(_ALLOWED)}",
        )

    # Determine extension from MIME type (ignore client-supplied extension)
    ext = _ALLOWED[content_type]

    # Sanitise original filename for display; use UUID for the actual path
    original_stem = Path(file.filename or "image").stem[:64]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    directory, query = image_directory(project)
    dest = directory / unique_name

    # Read with size guard
    data = await file.read(_MAX_BYTES + 1)
    if len(data) > _MAX_BYTES:
        raise HTTPException(413, detail="File exceeds 10 MB limit.")

    dest.write_bytes(data)

    url = f"/api/images/{unique_name}{query}"
    md = f"![{original_stem}]({url})"

    return JSONResponse({
        "url": url,
        "markdown": md,
        "filename": unique_name,
    })


@router.get("/images/{filename}", summary="Serve an uploaded project image")
async def serve_image(
    filename: str,
    project: str = Query(..., description="Project name"),
) -> FileResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")
    directory, _ = image_directory(project)
    path = directory / filename
    if not path.is_file():
        raise HTTPException(404, detail="Image not found.")
    return FileResponse(path)


@router.delete("/images/{filename}", summary="Delete an uploaded project image")
async def delete_image(
    filename: str,
    project: str = Query(..., description="Project name"),
) -> JSONResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(400, detail="Invalid filename.")

    directory, _ = image_directory(project)
    path = directory / filename
    if not path.exists():
        raise HTTPException(404, detail="Image not found.")

    path.unlink()
    return JSONResponse({"deleted": filename})
