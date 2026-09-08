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

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.models.schemas import ExportRequest
from app.services.markdown_svc import render_markdown
from app.services.pdf_svc import render_pdf

router = APIRouter(prefix="/api", tags=["export"])

# Full HTML document template — CSS is embedded so WeasyPrint reads it directly
_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
{css}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


@router.post("/export", summary="Export markdown to PDF")
async def export_pdf(req: ExportRequest, request: Request) -> Response:
    html_body = render_markdown(req.markdown)
    full_html = _HTML_TEMPLATE.format(css=req.css, body=html_body)

    # Pass the server's base URL so WeasyPrint can resolve image paths like
    # /static/images/photo.jpg → http://localhost:8000/static/images/photo.jpg
    base_url = str(request.base_url)

    # Run blocking WeasyPrint off the event loop
    pdf_bytes: bytes = await asyncio.to_thread(render_pdf, full_html, base_url)

    filename = (req.filename or "document").strip() or "document"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
