"""Pydantic request/response schemas."""
from pydantic import BaseModel, Field


class RenderRequest(BaseModel):
    markdown: str = Field(default="", description="Raw markdown text")
    css: str = Field(default="", description="Custom CSS to apply to the document")
    project: str = Field(default="", description="Active project directory name")
    filename: str = Field(default="", description="Active Markdown filename within the project")
    doc_path: str | None = Field(default=None, description="Active document path")
    doc_token: str | None = Field(default=None, description="Document token for scoped asset URL resolution")


class RenderResponse(BaseModel):
    html: str = Field(description="Rendered HTML body fragment (no <html>/<body> wrapper)")


class ExportRequest(BaseModel):
    markdown: str = Field(default="", description="Raw markdown text")
    css: str = Field(default="", description="Custom CSS to apply to the document")
    filename: str = Field(default="document", description="Output filename without extension")
    doc_path: str | None = Field(default=None, description="Document path for local relative asset resolution")
