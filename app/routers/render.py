"""
Render endpoint — POST /api/render

Accepts markdown + custom CSS, returns rendered HTML, and broadcasts
the result to all currently connected SSE subscribers so that other
preview clients (e.g. mobile, second monitor) receive the update too.
"""
from fastapi import APIRouter

from app.models.schemas import RenderRequest, RenderResponse
from app.services.broadcaster import broadcaster
from app.services.markdown_svc import render_markdown

router = APIRouter(prefix="/api", tags=["render"])


@router.post("/render", response_model=RenderResponse, summary="Render markdown to HTML")
async def render(req: RenderRequest) -> RenderResponse:
    html = render_markdown(req.markdown)

    # Broadcast to every connected SSE preview client
    await broadcaster.publish("render", {
        "project": req.project,
        "filename": req.filename,
        "html": html,
        "css": req.css,
    })

    return RenderResponse(html=html)
