"""Unit tests for DocumentContext discriminated unions, Context Resolver, and Safe I/O."""
import tempfile
import unittest
from pathlib import Path

from app.models.context import (
    ProjectDocumentContext,
    ProjectTarget,
    WatchDocumentContext,
    WatchTarget,
)
from app.services.context_svc import (
    compute_effective_css,
    resolve_document_context,
    resolve_project_context,
    resolve_watch_context,
)
from app.services.document_svc import read_document_io, write_document_io


class TestContextResolverAndSafeIO(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name).resolve()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_watch_context_strict_isolation_ignores_project_css(self):
        """A watched file in a directory containing project.css must NEVER inherit project.css."""
        folder = self.base_dir / "some-repo"
        folder.mkdir()
        doc_path = folder / "thesis.md"
        doc_path.write_text("# Thesis", encoding="utf-8")

        # Plant a project.css in the same directory
        project_css = folder / "project.css"
        project_css.write_text("body { background: red; }", encoding="utf-8")

        target = WatchTarget(doc_path=doc_path)
        context = resolve_document_context(target)

        self.assertIsInstance(context, WatchDocumentContext)
        self.assertEqual(context.mode, "watch")
        self.assertEqual(context.doc_path, doc_path)
        self.assertEqual(context.css_path, folder / "thesis.css")
        self.assertEqual(context.images_dir, folder / "images")
        # Assert statically and dynamically that project_css_path does not exist
        self.assertFalse(hasattr(context, "project_css_path"))

        # Effective CSS computation must completely ignore the sibling project.css
        effective = compute_effective_css(context, "h1 { color: blue; }")
        self.assertEqual(effective, "h1 { color: blue; }")
        self.assertNotIn("background: red", effective)

    def test_watch_context_relative_paths(self):
        """Relative custom_css must resolve relative to doc_path.parent."""
        folder = self.base_dir / "work" / "paper"
        folder.mkdir(parents=True)
        doc_path = folder / "draft.md"
        doc_path.write_text("# Draft", encoding="utf-8")

        target = WatchTarget(
            doc_path=doc_path,
            custom_css=Path("../shared/theme.css"),
        )
        context = resolve_document_context(target)

        self.assertIsInstance(context, WatchDocumentContext)
        expected_css = (folder / ".." / "shared" / "theme.css").resolve()

        self.assertEqual(context.css_path, expected_css)
        self.assertEqual(context.images_dir, folder / "images")

    def test_watch_context_absolute_paths(self):
        """Absolute custom paths must be preserved without rebasing."""
        folder = self.base_dir / "paper"
        folder.mkdir()
        doc_path = folder / "draft.md"
        doc_path.write_text("# Draft", encoding="utf-8")

        abs_css = (self.base_dir / "global.css").resolve()

        target = WatchTarget(
            doc_path=doc_path,
            custom_css=abs_css,
        )
        context = resolve_document_context(target)

        self.assertEqual(context.css_path, abs_css)
        self.assertEqual(context.images_dir, folder / "images")

    def test_project_context_resolution_and_cascade(self):
        """Project targets resolve within projects_root and inherit project.css."""
        projects_root = self.base_dir / "projects"
        project_dir = projects_root / "my-report"
        project_dir.mkdir(parents=True)

        doc_path = project_dir / "README.md"
        doc_path.write_text("# Report", encoding="utf-8")
        project_css = project_dir / "project.css"
        project_css.write_text("/* Shared project styles */", encoding="utf-8")

        target = ProjectTarget(project_name="my-report", filename="README.md")
        context = resolve_document_context(target, projects_root=projects_root)

        self.assertIsInstance(context, ProjectDocumentContext)
        self.assertEqual(context.mode, "project")
        self.assertEqual(context.doc_path, doc_path)
        self.assertEqual(context.project_name, "my-report")
        self.assertEqual(context.project_css_path, project_css)
        self.assertEqual(context.images_dir, project_dir / "images")

        # Effective CSS cascades project.css + doc_css
        effective = compute_effective_css(context, "h2 { color: green; }")
        self.assertIn("Shared project styles", effective)
        self.assertIn("h2 { color: green; }", effective)

    def test_project_traversal_prevention(self):
        """Path traversal outside project boundaries must raise ValueError."""
        projects_root = self.base_dir / "projects"
        projects_root.mkdir(parents=True)

        with self.assertRaises(ValueError):
            resolve_project_context("../evil", "README.md", projects_root)

        with self.assertRaises(ValueError):
            resolve_project_context("report", "../../../etc/passwd", projects_root)

    def test_safe_io_does_not_unlink_css_when_empty(self):
        """Saving with empty CSS must NEVER delete the CSS file from disk."""
        doc_path = self.base_dir / "test.md"
        css_path = self.base_dir / "test.css"

        # Initial write
        write_document_io(doc_path, "# Initial", "body { color: black; }", css_path)
        self.assertTrue(doc_path.is_file())
        self.assertTrue(css_path.is_file())

        # Save with empty CSS string
        write_document_io(doc_path, "# Updated", "", css_path)

        # CSS file must STILL exist and retain its previous content!
        self.assertTrue(css_path.is_file())
        self.assertEqual(css_path.read_text(encoding="utf-8"), "body { color: black; }")

        # Reading back returns the preserved CSS
        md_read, css_read, mtime = read_document_io(doc_path, css_path)
        self.assertEqual(md_read, "# Updated")
        self.assertEqual(css_read, "body { color: black; }")
        self.assertIsNotNone(mtime)


if __name__ == "__main__":
    unittest.main()
