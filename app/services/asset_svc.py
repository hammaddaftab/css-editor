"""Asset management service.

Handles:
- Repository root detection (.git, .css-editor.json, or fallback to doc directory).
- Smart drop/import: Content-hash matching to reuse existing images without duplication.
- Conventional image storage in ./images/ for new external files.
- Document-scoped image listing for the Image Library drawer.
"""
import hashlib
import os
import re
from pathlib import Path

from app.routers.assets import encode_doc_token

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

_COMMON_IMAGE_DIRS = {"images", "figures", "assets", "img", "static"}
_MD_IMG_PATTERN = re.compile(r"!\[.*?\]\((.+?)\)")


def find_project_root(doc_path: Path) -> Path:
    """Find the root of the project or repository containing doc_path."""
    doc = doc_path.resolve()
    current = doc.parent
    home = Path.home().resolve()

    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
        if (candidate / ".css-editor.json").is_file():
            return candidate
        if candidate == home or candidate == candidate.parent:
            break

    return current


def save_or_match_image(doc_path: Path, filename: str, file_bytes: bytes) -> tuple[str, str, bool]:
    """Import an image using smart content-hash matching.

    Returns:
        tuple[rel_path, final_filename, is_existing_match]
    """
    doc_dir = doc_path.resolve().parent
    project_root = find_project_root(doc_path)
    incoming_hash = hashlib.sha256(file_bytes).hexdigest()

    # 1. Check if the file already exists anywhere in project_root with identical content
    clean_name = Path(filename).name
    try:
        for candidate in project_root.rglob(clean_name):
            if candidate.is_file() and candidate.suffix.lower() in _ALLOWED_IMAGE_EXTS:
                if hashlib.sha256(candidate.read_bytes()).hexdigest() == incoming_hash:
                    # Match found! Use existing relative path without copying
                    rel = os.path.relpath(candidate, doc_dir).replace("\\", "/")
                    if not rel.startswith("."):
                        rel = f"./{rel}"
                    return rel, candidate.name, True
    except Exception:
        pass

    # 2. External / new image: save into ./images/
    dest_dir = doc_dir / "images"
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_file = dest_dir / clean_name
    stem = dest_file.stem
    suffix = dest_file.suffix
    counter = 1

    # Avoid clobbering a different file with the same name
    while dest_file.exists():
        if hashlib.sha256(dest_file.read_bytes()).hexdigest() == incoming_hash:
            # File with identical content already at dest
            return f"./images/{dest_file.name}", dest_file.name, True
        dest_file = dest_dir / f"{stem}-{counter}{suffix}"
        counter += 1

    dest_file.write_bytes(file_bytes)
    return f"./images/{dest_file.name}", dest_file.name, False


def list_document_images(doc_path: Path, markdown: str = "") -> list[dict]:
    """List available and referenced images for a document."""
    doc_dir = doc_path.resolve().parent
    token = encode_doc_token(doc_dir)
    discovered: dict[str, dict] = {}

    def _add_image(image_path: Path, rel_str: str | None = None):
        if not image_path.is_file() or image_path.suffix.lower() not in _ALLOWED_IMAGE_EXTS:
            return
        resolved = image_path.resolve()
        key = str(resolved)
        if key in discovered:
            return
        try:
            stat = resolved.stat()
            if rel_str is None:
                rel = os.path.relpath(resolved, doc_dir).replace("\\", "/")
                if not rel.startswith("."):
                    rel = f"./{rel}"
            else:
                rel = rel_str

            clean_url_rel = rel.lstrip("./")
            discovered[key] = {
                "filename": resolved.name,
                "rel_path": rel,
                "url": f"/api/assets/{token}/{clean_url_rel}",
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            }
        except Exception:
            pass

    # 1. Scan images referenced in Markdown
    if markdown:
        for match in _MD_IMG_PATTERN.findall(markdown):
            clean_url = match.split()[0].split("?")[0].strip()
            if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
                target = (doc_dir / clean_url).resolve()
                if target.is_file():
                    _add_image(target, rel_str=clean_url)

    # 2. Shallow scan doc_dir and common subdirectories
    for item in doc_dir.iterdir():
        if item.is_file():
            _add_image(item)
        elif item.is_dir() and item.name.lower() in _COMMON_IMAGE_DIRS:
            for sub_item in item.iterdir():
                if sub_item.is_file():
                    _add_image(sub_item)

    return sorted(discovered.values(), key=lambda x: x["mtime"], reverse=True)
