"""
Documents router — save and load markdown & CSS files locally in included directories.

Security:
  Restricted strictly to the current working directory and configured include_paths
  (no path traversal, no hidden files).
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.path_svc import (
    is_path_included,
    scan_markdown_files,
    to_relative_posix,
)

router = APIRouter(prefix="/api", tags=["documents"])

CWD = Path.cwd().resolve()

DEFAULT_MARKDOWN = """# Welcome to CSS Markdown Editor

A **live preview** markdown editor with A4 pagination, powered by
[paged.js](https://pagedjs.org/) in the browser and WeasyPrint for PDF export.

## Features

- Real-time preview via **Server-Sent Events**
- Multi-page A4 layout via **paged.js**
- PDF export via **WeasyPrint**
- Custom CSS — edit the CSS panel on the left

## Code

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello, World!"}
```

## Table

| Feature         | Browser Preview | PDF Export |
|-----------------|-----------------|------------|
| Page breaks     | paged.js        | WeasyPrint |
| Custom CSS      | ✓               | ✓          |
| @page rules     | ✓               | ✓          |

---

## Pandoc-Style Syntax (No HTML tags needed!)

::: warning
**Important Notice:** You can use `::: class-name` or `::: {.class #id key=val}` to create containers without polluting your markdown with raw `<div>` tags!
:::

::: {.callout #tip-1}
You can also use inline spans like [New Feature]{.badge .badge-info} or [Critical]{.badge .badge-warning}.
:::

::: page-break
:::

## Multi-Column Layout (Page 2)

:::: columns
::: col
### Left Column
Clean text on the left side of the page.
:::

::: col
### Right Column
Clean text on the right side of the page.
:::
::::
"""

DEFAULT_CSS = """/* Custom document CSS — overrides print.css defaults */

:root {
  --accent:      #0d9488;
  --color-link:  #0d9488;
}

h1 { border-bottom-color: var(--accent); }
h2 { color: #0f766e; }
pre.code-block { border-left-color: var(--accent); }
"""


class SaveDocumentRequest(BaseModel):
    filename: str = Field(default="document.md", description="Target markdown filename in current directory or included paths")
    markdown: str = Field(default="", description="Markdown content")
    css: str = Field(default="", description="Companion CSS content")


def resolve_local_file(filename: str, allowed_exts: tuple[str, ...] = (".md",)) -> Path:
    """Validate filename is strictly inside one of the configured include_paths."""
    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Filename cannot be empty.")

    clean_filename = filename.strip()
    path = (CWD / clean_filename).resolve()

    if not path.is_relative_to(CWD):
        raise HTTPException(status_code=400, detail="Access outside workspace directory is forbidden.")

    if not is_path_included(path, CWD, settings.include_paths):
        raise HTTPException(
            status_code=403,
            detail=f"Path '{filename}' is not within configured include paths: {settings.include_paths}",
        )

    if not any(path.name.lower().endswith(ext) for ext in allowed_exts):
        raise HTTPException(status_code=400, detail=f"File must have one of allowed extensions: {allowed_exts}")

    return path


@router.get("/documents", summary="List local markdown files in included directories")
async def list_local_documents() -> JSONResponse:
    files = scan_markdown_files(CWD, settings.include_paths)
    return JSONResponse({"files": files})


@router.get("/document", summary="Load a document from the current directory or included paths")
async def load_document(filename: str = "document.md") -> JSONResponse:
    path = resolve_local_file(filename, allowed_exts=(".md",))
    css_path = path.with_suffix(".css")
    rel_filename = to_relative_posix(path, CWD)

    # If document.md is requested but doesn't exist yet, initialize it
    if filename == "document.md" and not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(DEFAULT_MARKDOWN, encoding="utf-8")
        if not css_path.exists():
            css_path.write_text(DEFAULT_CSS, encoding="utf-8")

    if not path.exists():
        return JSONResponse({
            "filename": rel_filename,
            "markdown": "",
            "css": "",
            "exists": False,
        })

    markdown = path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""

    return JSONResponse({
        "filename": rel_filename,
        "markdown": markdown,
        "css": css,
        "exists": True,
        "css_filename": to_relative_posix(css_path, CWD) if css_path.exists() else None,
        "mtime": path.stat().st_mtime,
    })


@router.post("/document", summary="Save document to current directory or included path")
async def save_document(req: SaveDocumentRequest) -> JSONResponse:
    path = resolve_local_file(req.filename, allowed_exts=(".md",))
    css_path = path.with_suffix(".css")
    rel_filename = to_relative_posix(path, CWD)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(req.markdown, encoding="utf-8")
    if req.css is not None:
        css_path.write_text(req.css, encoding="utf-8")

    return JSONResponse({
        "saved": True,
        "filename": rel_filename,
        "css_filename": to_relative_posix(css_path, CWD) if req.css is not None else None,
        "mtime": path.stat().st_mtime,
    })
