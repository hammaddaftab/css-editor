"""Context resolution service for Watch Mode and Project Mode.

Provides type-safe resolution of DocumentContext from TargetSpec with static
type narrowing via @overload.
"""
from pathlib import Path
from typing import overload

from app.models.context import (
    DocumentContext,
    ProjectDocumentContext,
    ProjectTarget,
    TargetSpec,
    WatchDocumentContext,
    WatchTarget,
)


def resolve_watch_context(
    doc_path: Path,
    custom_css: Path | None = None,
) -> WatchDocumentContext:
    """Resolve an isolated standalone watch context.

    Guarantees:
    - Relative custom CSS is resolved relative to doc_path.parent.
    - Absolute custom CSS is preserved.
    - Default CSS resolves to doc_path.with_suffix('.css').
    - Conventional upload images_dir resolves to doc_path.parent / 'images'.
    - project_css is strictly omitted from the context.
    """
    doc = doc_path.expanduser().resolve()
    base_dir = doc.parent

    if custom_css is not None:
        css = custom_css if custom_css.is_absolute() else (base_dir / custom_css)
    else:
        css = doc.with_suffix(".css")

    images = base_dir / "images"

    return WatchDocumentContext(
        doc_path=doc,
        css_path=css.resolve(),
        images_dir=images.resolve(),
    )


def resolve_project_context(
    project_name: str,
    filename: str,
    projects_root: Path,
) -> ProjectDocumentContext:
    """Resolve a project document context scoped within projects_root."""
    clean_project = (project_name or "").strip()
    if not clean_project or clean_project in {".", ".."} or "/" in clean_project or "\\" in clean_project:
        raise ValueError(f"Invalid project name: {project_name}")

    clean_file = (filename or "").strip()
    if not clean_file or Path(clean_file).is_absolute():
        raise ValueError(f"Invalid document filename: {filename}")

    root = projects_root.expanduser().resolve()
    project_dir = (root / clean_project).resolve()
    if not project_dir.is_relative_to(root):
        raise ValueError("Project path traversal outside projects root is prohibited.")

    doc = (project_dir / clean_file).resolve()
    if not doc.is_relative_to(project_dir):
        raise ValueError("Document path traversal outside project directory is prohibited.")

    proj_css = project_dir / "project.css"
    project_css_path = proj_css if proj_css.is_file() else None

    return ProjectDocumentContext(
        doc_path=doc,
        project_dir=project_dir,
        project_name=clean_project,
        css_path=doc.with_suffix(".css"),
        images_dir=(project_dir / "images").resolve(),
        project_css_path=project_css_path,
    )


@overload
def resolve_document_context(
    target: WatchTarget,
    projects_root: Path | None = None,
) -> WatchDocumentContext: ...


@overload
def resolve_document_context(
    target: ProjectTarget,
    projects_root: Path,
) -> ProjectDocumentContext: ...


def resolve_document_context(
    target: TargetSpec,
    projects_root: Path | None = None,
) -> DocumentContext:
    """Resolve a TargetSpec into its corresponding concrete DocumentContext."""
    if target.mode == "watch":
        return resolve_watch_context(
            doc_path=target.doc_path,
            custom_css=target.custom_css,
        )

    if projects_root is None:
        raise ValueError("projects_root is required when resolving a ProjectTarget.")

    return resolve_project_context(
        project_name=target.project_name,
        filename=target.filename,
        projects_root=projects_root,
    )


def compute_effective_css(context: DocumentContext, doc_css: str) -> str:
    """Combine base/project CSS and document CSS based on the context mode."""
    if context.mode == "watch":
        return doc_css

    # In project mode, layer project.css under the page-specific doc_css
    if context.project_css_path and context.project_css_path.is_file():
        project_css_text = context.project_css_path.read_text(encoding="utf-8")
        if project_css_text.strip():
            return f"{project_css_text}\n{doc_css}" if doc_css.strip() else project_css_text

    return doc_css
