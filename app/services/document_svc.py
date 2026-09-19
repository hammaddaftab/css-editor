"""Pure, safe Document I/O layer.

This layer deals strictly with physical file paths on disk:
- Reading markdown and companion CSS files.
- Writing markdown and companion CSS files non-destructively (never unlinking files on empty input).
"""
from pathlib import Path


def read_document_io(doc_path: Path, css_path: Path | None = None) -> tuple[str, str, float | None]:
    """Read markdown and CSS content from disk.

    Returns:
        tuple[markdown_text, css_text, doc_mtime]
    """
    doc = doc_path.resolve()
    css_target = css_path.resolve() if css_path else doc.with_suffix(".css")

    markdown = doc.read_text(encoding="utf-8") if doc.is_file() else ""
    css = css_target.read_text(encoding="utf-8") if css_target.is_file() else ""
    mtime = doc.stat().st_mtime if doc.is_file() else None

    return markdown, css, mtime


def write_document_io(
    doc_path: Path,
    markdown: str,
    css: str = "",
    css_path: Path | None = None,
) -> None:
    """Write markdown and optional CSS content to disk non-destructively.

    Guarantees:
        - Creates parent directories if they do not exist.
        - Writes CSS only if non-empty content is provided.
        - NEVER unlinks or deletes existing CSS files when css is empty.
    """
    doc = doc_path.resolve()
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(markdown, encoding="utf-8")

    if css.strip():
        css_target = css_path.resolve() if css_path else doc.with_suffix(".css")
        css_target.parent.mkdir(parents=True, exist_ok=True)
        css_target.write_text(css, encoding="utf-8")
