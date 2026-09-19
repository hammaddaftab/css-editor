# ADR 0002: Watch Mode Architectural Separation and Self-Contained Lifecycle Orchestration

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Hammad, Antigravity

---

## Context and Problem Statement

Following the adoption of [ADR 0001](file:///home/hammad/code/css-editor/docs/adr/0001-document-centric-context-and-mode-isolation.md), file watching was handled through a monolithic service (`ProjectWatcherManager`) with ad-hoc background tasks in `app/main.py`.

This design suffered from several architectural deficiencies:
1. **No Clean Detection/Orchestration Separation**: Route handlers (`app/routers/documents.py`) had to manually execute low-level start/stop calls (`watcher_manager.watch_document()` vs `watcher_manager.stop_document_watcher()`), coupling HTTP controllers to watcher implementation details.
2. **Global Workspace Event Churn**: The project watcher monitored the entire `projects_root` tree recursively across all projects. Every filesystem event on disk required complex path traversal heuristics (`_project_file`) to deduce which project a file belonged to.
3. **Fragmented CLI Flag Handling**: Passing `-w` / `--watch` created an unmanaged, loose background task inside FastAPI's `lifespan`, requiring separate manual cancellation loops on shutdown.
4. **Leaky Cleanup**: Watchers did not encapsulate their own task lifecycle. Switching modes or shutting down the application risked leaking running coroutines or dangling filesystem handles.

We needed a strict separation of concerns where detection is isolated from execution, project watching is scoped to the active project only, and all watchers encapsulate their own cleanup.

---

## Decision

We separate file watching into three distinct layers with self-contained lifecycles:

```
                   ┌───────────────────────────────────────────┐
                   │            ACTIVATION SOURCES             │
                   │  - CLI Flag:   css-editor -w <path>       │
                   │  - Frontend:   GET /api/document?mode=... │
                   └─────────────────────┬─────────────────────┘
                                         │
                                         ▼
               ┌───────────────────────────────────────────────────┐
               │       1. WatchOrchestrator (Detection Only)       │
               │                                                   │
               │  - detect_cli_watch(watch_file, custom_css)       │
               │  - detect_and_activate(context)                   │
               │  - current_mode: 'watch' | 'project' | 'idle'     │
               │  - Coordinates clean handoffs & mutual exclusion  │
               └─────────────┬───────────────────────┬─────────────┘
    activates Standalone     │                       │ activates Respective
    Watch Mode               │                       │ Project Mode
                             ▼                       ▼
        ┌─────────────────────────────┐   ┌─────────────────────────────┐
        │ 2. WatchModeHandler         │   │ 3. ProjectWatcherHandler    │
        │    (Standalone Docs)        │   │    (Respective Project Only)│
        ├─────────────────────────────┤   ├─────────────────────────────┤
        │ - Monitors parent dirs      │   │ - Watches ONLY:             │
        │ - Atomic-save resilient     │   │   <projects_root>/<project>/│
        │ - Broadcasts document:change│   │ - Ignores sibling projects  │
        │ - Self-contained cleanup:   │   │ - Self-contained cleanup:   │
        │   • start(context)          │   │   • start(name, dir)        │
        │   • stop() / cleanup()      │   │   • stop() / cleanup()      │
        └─────────────────────────────┘   └─────────────────────────────┘
```

### 1. Orchestrator Layer (`WatchOrchestrator`)
The Orchestrator's sole responsibility is **detecting watch mode triggers and managing mode transitions**:
- **Zero File I/O**: It does not call `watchfiles.awatch`, inspect inodes, read file contents, or render markdown.
- **Dual Activation Detection**:
  - **CLI Flag**: `detect_cli_watch(watch_file, custom_css)` detects `-w` / `--watch` flags on server boot, stops any project watchers, and transitions to standalone watch mode.
  - **Frontend API Calls**: `detect_and_activate(context)` detects target modes (`"watch"` vs `"project"`) from incoming document requests.
- **Mutual Exclusivity**: Activating standalone watch mode cleanly stops any project watcher; activating project mode cleanly stops the standalone watcher.

### 2. Standalone Watch Mode Layer (`WatchModeHandler`)
Dedicated exclusively to external documents outside managed project directories:
- **Atomic-Save Resilient**: Monitors `context.doc_path.parent` and `context.css_path.parent`, surviving temp-file inode replacement from Neovim, Vim, and VS Code.
- **Strict Isolation**: Completely decoupled from project directories and `project.css`.
- **Self-Contained Cleanup**: Encapsulates its own `_task: asyncio.Task | None`. Calling `stop()` cancels the task, awaits completion, and nullifies state.

### 3. Project Watcher Layer (`ProjectWatcherHandler`)
Watches **only the active respective project directory**:
- **Scoped Monitoring**: Monitors `<projects_root>/<active_project>/` exclusively. Edits in sibling projects on disk produce zero OS watch events.
- **Elimination of Path Heuristics**: Resolves paths directly relative to the project directory (`path.relative_to(project_dir)`), eliminating the 25-line `_project_file` heuristic tree parser.
- **Self-Contained Cleanup**: Encapsulates its own `_task: asyncio.Task | None`. Calling `stop()` cancels the task, awaits completion, and nullifies state.

### 4. Self-Contained Cleanup Guarantee
Neither handler relies on callers to manage task cancellation. Each handler's `stop()` method:
1. Checks if `self._task and not self._task.done()`.
2. Cancels `self._task`.
3. Awaits the task catching `asyncio.CancelledError`.
4. Resets internal references to `None`.
5. Is completely idempotent (safe to call multiple times).

---

## Consequences

### Positive
- **Clean Separation of Concerns**: Detection logic is decoupled from low-level filesystem polling and event broadcasting.
- **Reduced OS Overhead**: Watching only the active project directory minimizes OS inotify/kqueue watchers and eliminates cross-project noise.
- **Zero Dangling Background Tasks**: Self-contained lifecycle management prevents memory leaks and orphaned background tasks on mode transitions and server shutdown.
- **Simplified Application Lifespan**: `app/main.py` replaces loose task lists with `watch_orchestrator.detect_cli_watch()` on startup and `watch_orchestrator.shutdown()` on exit.
- **Backward Compatible**: Package facade (`app/services/watcher/__init__.py`) re-exports aliases (`watcher_manager`, `watch_document`, `watch_directory`), ensuring 100% test and route compatibility.

### Negative / Trade-offs
- Switching between projects requires an explicit transition call to the orchestrator rather than relying on a passive global directory watcher.
