"""
PDF generation service.

Wraps WeasyPrint to render an HTML document string to PDF bytes.

WeasyPrint is synchronous and CPU-bound. Callers should run this function
in a thread pool (asyncio.to_thread) to avoid blocking the event loop.

The caller is responsible for embedding any user CSS inside the HTML
<style> tag — WeasyPrint reads it directly from the document.
"""
from weasyprint import HTML
from weasyprint.text.fonts import FontConfiguration


def render_pdf(html: str, base_url: str | None = None) -> bytes:
    """
    Render *html* to PDF bytes.

    Args:
        html:     Full HTML document string (including <html> and <body>).
                  CSS should already be embedded in a <style> tag.
        base_url: Base URL used to resolve relative resource URLs (images,
                  fonts, stylesheets) during rendering. Pass the server's
                  origin (e.g. "http://localhost:8000/") so WeasyPrint can
                  fetch /static/images/* over HTTP just like the browser does.

    Returns:
        Raw PDF bytes.
    """
    font_config = FontConfiguration()
    return HTML(string=html, base_url=base_url).write_pdf(font_config=font_config)
