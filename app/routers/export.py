"""
PDF export endpoint — POST /api/export

Converts markdown → HTML → PDF via WeasyPrint and streams the PDF
back as a file download.

WeasyPrint is synchronous and CPU-bound; we run it in a thread pool
via asyncio.to_thread to keep the event loop responsive.

base_url is passed to WeasyPrint so it can fetch images and other
resources from the running FastAPI server (e.g. /static/images/*).
"""
import asyncio
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.core.config import settings
from app.models.schemas import ExportRequest
from app.services.config_manager import load_user_config
from app.services.markdown_svc import render_markdown
from app.services.pdf_svc import render_pdf

router = APIRouter(prefix="/api", tags=["export"])

_PRINT_CSS_PATH = settings.static_path / "css" / "print.css"
_PRINT_CSS = _PRINT_CSS_PATH.read_text(encoding="utf-8")

# Full HTML document template — CSS is embedded so WeasyPrint reads it directly
_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
{author_meta}
  <style>
{css}
  </style>
</head>
<body>
{body}
</body>
</html>
"""



# relies on local service which uses MarkdownIt to render html body
# combies with a template and fill in body + css
# passes the html to weasyprint
@router.post("/export", summary="Export markdown to PDF")
async def export_pdf(req: ExportRequest, request: Request) -> Response:
    html_body = render_markdown(req.markdown)
    # Keep PDF export aligned with the paged.js preview.  The preview loads
    # print.css first and then applies the user's CSS as overrides.
    combined_css = f"{_PRINT_CSS}\n{req.css}"
    user_config, _ = load_user_config()
    author_meta = (
        f'  <meta name="author" content="{user_config.author_name}">'
        if user_config.author_name
        else ""
    )
    full_html = _HTML_TEMPLATE.format(css=combined_css, body=html_body, author_meta=author_meta)

    # Pass local directory base URL if doc_path is specified so WeasyPrint can resolve
    # relative image paths (e.g. ./figures/arch.png) directly from disk.
    if req.doc_path:
        base_url = str(Path(req.doc_path).resolve().parent)
    else:
        base_url = str(request.base_url)

    # Run blocking WeasyPrint off the event loop
    pdf_bytes: bytes = await asyncio.to_thread(render_pdf, full_html, base_url)

    filename = (req.filename or "document").strip() or "document"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
