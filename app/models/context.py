"""Domain models and discriminated unions for Document Contexts and Targets."""
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


# ── Target Specifications (Input Discriminated Union) ──────────────────────────


class WatchTarget(BaseModel):
    """Target spec for an independent watched file outside project boundaries."""

    mode: Literal["watch"] = "watch"
    doc_path: Path = Field(description="Absolute or resolvable path to Markdown file")
    custom_css: Path | None = Field(default=None, description="Optional custom stylesheet path")


class ProjectTarget(BaseModel):
    """Target spec for a document scoped within a managed project directory."""

    mode: Literal["project"] = "project"
    project_name: str = Field(description="Project directory name")
    filename: str = Field(description="Relative document filename within project")


TargetSpec = Annotated[Union[WatchTarget, ProjectTarget], Field(discriminator="mode")]


# ── Resolved Contexts (Output Discriminated Union) ─────────────────────────────


@dataclass(frozen=True)
class WatchDocumentContext:
    """Strictly isolated standalone document context.

    Note: project_css_path and project_dir DO NOT exist on this type.
    It is impossible for project-level shared stylesheets to leak into this context.
    Images are always resolved relative to doc_path.parent.
    """

    doc_path: Path
    css_path: Path
    images_dir: Path  # Standard conventional import directory (doc_path.parent / "images")
    mode: Literal["watch"] = "watch"


@dataclass(frozen=True)
class ProjectDocumentContext:
    """Document context scoped within a managed project workspace."""

    doc_path: Path
    project_dir: Path
    project_name: str
    css_path: Path
    images_dir: Path
    project_css_path: Path | None = None
    mode: Literal["project"] = "project"


DocumentContext = Union[WatchDocumentContext, ProjectDocumentContext]
