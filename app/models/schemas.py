"""Pydantic request/response schemas."""
from pydantic import BaseModel, Field


class RenderRequest(BaseModel):
    markdown: str = Field(default="", description="Raw markdown text")
    css: str = Field(default="", description="Custom CSS to apply to the document")


class RenderResponse(BaseModel):
    html: str = Field(description="Rendered HTML body fragment (no <html>/<body> wrapper)")


class ExportRequest(BaseModel):
    markdown: str = Field(default="", description="Raw markdown text")
    css: str = Field(default="", description="Custom CSS to apply to the document")
    filename: str = Field(default="document", description="Output filename without extension")
