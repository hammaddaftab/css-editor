"""HTML page routes — serves the main editor SPA with full HTTP conditional GET support."""
import datetime
import hashlib
from email.utils import formatdate, parsedate_to_datetime
from pathlib import Path

from fastapi import APIRouter, Request
from starlette.responses import FileResponse, Response

from app.core.config import settings

router = APIRouter(tags=["pages"])


def serve_index_with_conditional_cache(request: Request) -> Response:
    """
    Serve index.html with full RFC 7232 HTTP Conditional GET support:
      - Last-Modified (formatted HTTP date)
      - ETag (content hash)
      - Content-Length
      - Cache-Control: no-cache (prompts browser to send If-Modified-Since / If-None-Match on refresh)
      - Returns 304 Not Modified when matching If-Modified-Since or If-None-Match
    """
    index_path = settings.templates_path / "index.html"
    stat_result = index_path.stat()
    mtime = stat_result.st_mtime
    file_size = stat_result.st_size
    last_modified_str = formatdate(mtime, usegmt=True)
    etag = f'"{hashlib.md5(index_path.read_bytes()).hexdigest()}"'

    if_none_match = request.headers.get("if-none-match")
    if_modified_since = request.headers.get("if-modified-since")

    not_modified = False
    if if_none_match:
        tags = [tag.strip().removeprefix("W/") for tag in if_none_match.split(",")]
        if etag in tags or etag.strip('"') in tags:
            not_modified = True
    elif if_modified_since:
        try:
            req_dt = parsedate_to_datetime(if_modified_since)
            file_dt = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc)
            if req_dt >= file_dt.replace(microsecond=0):
                not_modified = True
        except Exception:
            pass

    if not_modified:
        return Response(
            status_code=304,
            headers={
                "cache-control": "no-cache",
                "etag": etag,
                "last-modified": last_modified_str,
                "date": formatdate(usegmt=True),
            },
        )

    return FileResponse(
        index_path,
        stat_result=stat_result,
        media_type="text/html",
        headers={
            "cache-control": "no-cache",
            "etag": etag,
            "last-modified": last_modified_str,
            "content-length": str(file_size),
        },
    )


@router.get("/", include_in_schema=False)
@router.get("/index.html", include_in_schema=False)
async def index(request: Request) -> Response:
    watch_file = getattr(request.app.state, "initial_watch_file", None)
    if not request.url.query and watch_file and isinstance(watch_file, Path) and watch_file.is_file():
        from urllib.parse import quote
        from starlette.responses import RedirectResponse
        return RedirectResponse(f"/?mode=watch&path={quote(str(watch_file))}", status_code=307)
    return serve_index_with_conditional_cache(request)
