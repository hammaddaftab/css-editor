# ADR 0001: Document-Centric Architecture and Mode-Discriminated Context Resolution

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Hammad, Antigravity

---

## Context and Problem Statement

`css-editor` serves both integrated project authors (multi-page publication studio) and external power users (Neovim/VS Code/Obsidian live preview companion). 

Previously, the architecture attempted to bifurcate the application into two separate systems:
- Duplicated routes (`/api/project/*` vs `/api/watch/*`).
- Duplicated asset storage strategies.
- Fragile auto-detection where standalone watched files risked accidentally merging sibling/parent `project.css` styles.
- Ambiguous types (`Path | None`) that forced consumers to make defensive runtime checks.

We needed a unified, minimal model that provides strict style isolation while eliminating API duplication.

---

## Decision

We treat the **Document** as the universal foundational primitive, using an explicit **`mode` discriminator** to dictate whether shared project conventions apply.

### 1. Document as the Base
Every operation in the system anchors on a concrete document path (`doc_path`).
- Companion stylesheets (`css_path`) default to sibling `<stem>.css` or user overrides.
- All image assets resolve relative to the document parent directory (`doc_path.parent`). No custom images directory configuration is needed or exposed.
- Browser preview resolves relative assets via `<base href="/api/assets/<doc_token>/">` without HTML rewriting.
- External images dropped or picked from outside the project tree are automatically imported (copied) into `./images/` by convention, ensuring 100% document portability. Direct serving of arbitrary external absolute paths is omitted.

### 2. Mode Distinguishes Shared Convention Lookup
The explicit discriminator `mode: "watch" | "project"` determines whether the document considers enclosing project defaults:

- **`mode: "watch"` (Standalone Isolation)**:
  - Strictly isolated.
  - **Never** searches for or merges parent `project.css` files.
  - Statically omits project attributes.
  
- **`mode: "project"` (Managed Workspace)**:
  - Scoped within the managed projects root.
  - Automatically discovers and layers `<project_dir>/project.css` under the document's page-specific CSS.
  - Automatically binds `<project_dir>/images` across all documents in that project.

### 3. Discriminated Unions at the Domain Boundary
Instead of optional `Path | None` fields:
- **Input:** `TargetSpec = Annotated[Union[WatchTarget, ProjectTarget], Field(discriminator="mode")]`
- **Output:** `DocumentContext = Union[WatchDocumentContext, ProjectDocumentContext]`
  - `WatchDocumentContext` statically does not possess a `project_css_path` field, guaranteeing at compile time (mypy/pyright) that project styles cannot leak into watched files.

---

## Consequences

### Positive
- **Zero API Duplication:** Unified endpoints (`/api/document`, `/api/images`, `/api/render`, `/api/export`) operate on document paths without parallel `/api/watch/...` routes.
- **Strict Isolation:** Standalone files in Git repos never suffer from phantom CSS bleeding from surrounding directories.
- **Type Safety:** Consumers narrow context cleanly via `context.mode` without ambiguous `None` checks.
- **Non-Destructive:** Document persistence never deletes user stylesheets if CSS input is empty.

### Negative / Trade-offs
- Consumers must explicitly pass `mode` (defaulting to `"watch"`) rather than relying on automatic folder detection.
