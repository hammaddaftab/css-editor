"""
Path resolution and validation utilities for included directories.
"""
from pathlib import Path

IGNORE_PREFIXES = (".", "~", "#")
IGNORE_SUFFIXES = (".tmp", ".swp", ".swo", ".bak", "~")


def get_watch_directories(root_dir: Path, include_paths: list[str]) -> list[Path]:
    """
    Return existing directory Paths to watch based on include_paths.
    Only directories within root_dir are included.
    """
    root = root_dir.resolve()
    watch_dirs: list[Path] = []

    for inc in include_paths:
        clean = inc.strip().strip("/\\")
        target = root if not clean or clean == "." else (root / clean).resolve()
        if target.is_dir() and target.is_relative_to(root):
            if target not in watch_dirs:
                watch_dirs.append(target)

    return watch_dirs


def is_path_included(path: Path, root_dir: Path, include_paths: list[str]) -> bool:
    """
    Check if a given path is inside one of the configured include_paths.
    Rejects any paths outside root_dir, hidden files/directories, or temporary files.
    """
    root = root_dir.resolve()
    try:
        resolved = path.resolve()
        rel = resolved.relative_to(root)
    except (ValueError, RuntimeError):
        return False

    # Ignore hidden folders or files (e.g. .git, .env)
    if any(part.startswith(".") for part in rel.parts):
        return False

    name = resolved.name
    if any(name.startswith(p) for p in IGNORE_PREFIXES):
        return False
    if any(name.endswith(s) for s in IGNORE_SUFFIXES):
        return False

    parent_rel = rel.parent

    for inc in include_paths:
        clean = inc.strip().strip("/\\")
        inc_p = Path(".") if not clean or clean == "." else Path(clean)

        if inc_p == Path("."):
            # "." strictly matches files directly in root_dir
            if parent_rel == Path("."):
                return True
        else:
            # Subdirectory matches files directly inside or in subdirectories of it
            if parent_rel == inc_p or parent_rel.is_relative_to(inc_p):
                return True

    return False


def is_watched_file(path: Path, root_dir: Path, include_paths: list[str]) -> bool:
    """Check whether a path is an included .md or .css file."""
    if path.suffix.lower() not in (".md", ".css"):
        return False
    return is_path_included(path, root_dir, include_paths)


def to_relative_posix(path: Path, root_dir: Path) -> str:
    """Return relative POSIX path string from root_dir."""
    return path.resolve().relative_to(root_dir.resolve()).as_posix()


def scan_markdown_files(root_dir: Path, include_paths: list[str]) -> list[dict]:
    """
    Scan all included directories for markdown files and return their metadata.
    """
    root = root_dir.resolve()
    found: dict[str, dict] = {}

    for inc in include_paths:
        clean = inc.strip().strip("/\\")
        target = root if not clean or clean == "." else (root / clean).resolve()
        if not target.is_dir() or not target.is_relative_to(root):
            continue

        # Non-recursive for root, recursive for subfolders
        glob_pattern = "*.md" if target == root else "**/*.md"
        for p in target.glob(glob_pattern):
            if p.is_file() and is_path_included(p, root, include_paths) and p.suffix.lower() == ".md":
                rel_name = to_relative_posix(p, root)
                if rel_name not in found:
                    stat = p.stat()
                    found[rel_name] = {
                        "filename": rel_name,
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    }

    return sorted(found.values(), key=lambda item: item["filename"])
