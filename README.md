# CSS Markdown Editor

A live markdown editor with **CSS customisation**, **multi-page A4 preview**, and **PDF export**.

## Stack

| Layer | Technology |
|---|---|
| Server | FastAPI + uvicorn |
| Markdown parsing | markdown-it-py |
| PDF export | WeasyPrint |
| File watching | watchfiles |
| Live events | Server-Sent Events (SSE) |
| A4 preview | paged.js polyfill (sandboxed iframe) |
| Code editor | CodeMirror 6 via esm.sh |

## Quick start

```bash
python3 -m pip install -r requirements.txt
uvicorn app.main:app --reload
# open http://localhost:8000
```

## Environment variables (.env)

| Variable | Default | Description |
|---|---|---|
| `EDITOR_WATCH_FILE` | unset | Path to a .md file to watch on disk |
| `EDITOR_DEBUG` | false | Enable FastAPI debug mode |
