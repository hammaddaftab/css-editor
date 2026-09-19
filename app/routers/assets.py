"""Scoped asset serving router.

Serves local image files relative to the active document directory
without requiring HTML or Markdown rewriting. The browser preview resolves
relative paths against <base href="/api/assets/{doc_token}/">.
"""
import base64
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/assets", tags=["assets"])

_ALLOWED_IMAGE_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".ico",
}


def encode_doc_token(doc_dir: Path) -> str:
    """Encode a document directory Path into a URL-safe base64 token."""
    resolved = str(doc_dir.resolve()).encode("utf-8")
    return base64.urlsafe_b64encode(resolved).decode("utf-8")


def decode_doc_token(token: str) -> Path:
    """Decode a URL-safe base64 token back to a directory Path."""
    try:
        raw_bytes = base64.urlsafe_b64decode(token.encode("utf-8"))
        return Path(raw_bytes.decode("utf-8")).resolve()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid document asset token.") from exc


@router.get("/{token}/{rel_path:path}", summary="Serve a relative asset from the document directory")
async def serve_relative_asset(token: str, rel_path: str) -> FileResponse:
    base_dir = decode_doc_token(token)
    target = (base_dir / rel_path).resolve()

    if target.suffix.lower() not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden asset type '{target.suffix}'. Only image formats are served.",
        )

    if not target.is_file():
        raise HTTPException(status_code=404, detail="Asset not found.")

    return FileResponse(target)
