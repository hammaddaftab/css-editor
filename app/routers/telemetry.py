"""
Telemetry Ingestion & Dispatcher — POST /api/telemetry

Handles:
1. Server-side event tracking (e.g. app_opened during FastAPI lifespan startup).
2. First-party reverse proxy for frontend events (e.g. export_clicked with integrity),
   bypassing browser ad blockers.

Enforces a single canonical anonymous_id across both backend and frontend events
so that PostHog tracks the same user profile, retention curves, and funnels.
"""
from typing import Any, Dict, Set
import asyncio
import datetime
import logging
import os
import sys

from fastapi import APIRouter, BackgroundTasks, Request, Response
import httpx

from app.services.config_manager import load_user_config

router = APIRouter(prefix="/api", tags=["telemetry"])
logger = logging.getLogger(__name__)

POSTHOG_API_KEY = os.environ.get(
    "POSTHOG_API_KEY", "phc_tLQqCGZC753ni4izcGHYTEzDEBbnMLMQeGSPLQe3UhR2"
)
POSTHOG_INGEST_URL = "https://us.i.posthog.com/capture/"

# Retain references to background tasks to prevent garbage collection mid-execution
_background_tasks: Set[asyncio.Task] = set()

def get_backend_distinct_id() -> str:
    """Retrieve the persistent anonymous UUID from user configuration."""
    try:
        config, _ = load_user_config()
        return config.anonymous_id
    except Exception:
        return "anonymous_user"


async def forward_to_posthog(payload: Dict[str, Any]) -> None:
    # Single canonical setup of api_key and distinct_id
    payload["api_key"] = POSTHOG_API_KEY
    payload.setdefault("properties", {})["distinct_id"] = get_backend_distinct_id()

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(POSTHOG_INGEST_URL, json=payload)
            if resp.status_code >= 400:
                logger.debug("PostHog ingestion returned HTTP %s: %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.debug("Failed to forward telemetry payload: %s", exc)


def track_backend_event(event: str, properties: Dict[str, Any] | None = None) -> asyncio.Task | None:
    """Send an event directly from the backend as a non-blocking background task."""
    payload = {
        "event": event,
        "properties": {
            "$lib": "css-editor-backend",
            "$lib_version": "1.0.2",
            "platform": sys.platform,
            **(properties or {}),
        },
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(forward_to_posthog(payload))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
        return task
    except RuntimeError:
        logger.debug("Cannot track backend event '%s': no running asyncio event loop.", event)
        return None


@router.post("/telemetry", summary="Ingest telemetry events and forward to PostHog")
async def ingest_telemetry(request: Request, background_tasks: BackgroundTasks) -> Response:
    try:
        payload = await request.json()
        if payload and isinstance(payload, dict):
            background_tasks.add_task(forward_to_posthog, payload)
    except Exception as exc:
        logger.debug("Error processing telemetry ingestion request: %s", exc)
    return Response(status_code=204)
