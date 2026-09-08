"""
Server-Sent Events endpoint — GET /api/events

Each connected client gets a dedicated asyncio.Queue. The EventBroadcaster
pushes serialised SSE payloads into every queue; this generator streams them
out as the HTTP response body.

Heartbeat comments (": keep-alive") are sent every 25 s to prevent proxies
and browsers from closing idle connections.
"""
import asyncio

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services.broadcaster import broadcaster

router = APIRouter(prefix="/api", tags=["sse"])

_HEARTBEAT_SECS = 25


@router.get("/events", include_in_schema=False, summary="SSE event stream")
async def sse_events() -> StreamingResponse:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=20)
    broadcaster.add_client(queue)

    async def stream():
        # Handshake — lets the client know the connection is live
        yield "event: connected\ndata: {}\n\n"
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=_HEARTBEAT_SECS)
                    yield event
                except asyncio.TimeoutError:
                    # SSE comment keeps the TCP connection alive through proxies
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.remove_client(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering
            "Connection": "keep-alive",
        },
    )
