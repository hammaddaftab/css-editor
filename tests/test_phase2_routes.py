"""Integration tests for Phase 2: Unified document routes and scoped asset serving."""
import hashlib
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.testclient import TestClient

from app.main import app
from app.routers.assets import encode_doc_token


class TestPhase2Routes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name).resolve()
        self.projects_dir = self.base_dir / "projects"
        self.projects_dir.mkdir(parents=True)

        self.patcher = patch("app.routers.documents.get_projects_root", return_value=self.projects_dir)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

        self.patcher_images = patch("app.routers.images.get_projects_root", return_value=self.projects_dir)
        self.patcher_images.start()
        self.addCleanup(self.patcher_images.stop)

        self.client = TestClient(app)

    def tearDown(self):
        self.temp_dir.cleanup()

    # ── 1. Unified Document Endpoints ──────────────────────────────────────────

    def test_get_document_watch_mode(self):
        folder = self.base_dir / "external-paper"
        folder.mkdir()
        doc_path = folder / "paper.md"
        css_path = folder / "paper.css"
        doc_path.write_text("# Watched Title", encoding="utf-8")
        css_path.write_text("h1 { color: red; }", encoding="utf-8")

        # Also plant a project.css to confirm strict isolation
        (folder / "project.css").write_text("body { background: black; }", encoding="utf-8")

        res = self.client.get(f"/api/document?mode=watch&path={doc_path}")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["mode"], "watch")
        self.assertEqual(data["markdown"], "# Watched Title")
        self.assertEqual(data["css"], "h1 { color: red; }")
        self.assertIsNone(data["shared_css"])  # Strictly isolated!
        self.assertTrue(data["exists"])
        self.assertIsNotNone(data["doc_token"])

    def test_get_document_project_mode(self):
        proj_dir = self.projects_dir / "demo-proj"
        proj_dir.mkdir()
        doc = proj_dir / "README.md"
        doc.write_text("# Project Readme", encoding="utf-8")
        (proj_dir / "project.css").write_text("/* Shared project CSS */", encoding="utf-8")

        res = self.client.get("/api/document?mode=project&project=demo-proj&filename=README.md")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["mode"], "project")
        self.assertEqual(data["markdown"], "# Project Readme")
        self.assertIn("Shared project CSS", data["shared_css"])

    def test_post_document_save_watch_mode(self):
        folder = self.base_dir / "my-notes"
        folder.mkdir()
        doc_path = folder / "notes.md"

        payload = {
            "mode": "watch",
            "path": str(doc_path),
            "markdown": "# Saved Content",
            "css": "p { font-size: 14px; }",
        }
        res = self.client.post("/api/document", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["saved"])

        self.assertTrue(doc_path.is_file())
        self.assertEqual(doc_path.read_text(encoding="utf-8"), "# Saved Content")
        css_file = folder / "notes.css"
        self.assertTrue(css_file.is_file())
        self.assertEqual(css_file.read_text(encoding="utf-8"), "p { font-size: 14px; }")

    # ── 2. Scoped Asset Mount ──────────────────────────────────────────────────

    def test_serve_relative_asset_success(self):
        folder = self.base_dir / "paper"
        subfolder = folder / "figures"
        subfolder.mkdir(parents=True)
        img_file = subfolder / "chart.png"
        img_file.write_bytes(b"\x89PNG\r\n\x1a\nFakePngContent")

        token = encode_doc_token(folder)
        res = self.client.get(f"/api/assets/{token}/figures/chart.png")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"\x89PNG\r\n\x1a\nFakePngContent")

    def test_serve_relative_asset_forbidden_ext(self):
        folder = self.base_dir / "paper"
        folder.mkdir()
        secret = folder / "secret.txt"
        secret.write_text("classified", encoding="utf-8")

        token = encode_doc_token(folder)
        res = self.client.get(f"/api/assets/{token}/secret.txt")
        self.assertEqual(res.status_code, 403)

    def test_serve_relative_asset_404(self):
        folder = self.base_dir / "paper"
        folder.mkdir()
        token = encode_doc_token(folder)
        res = self.client.get(f"/api/assets/{token}/missing.png")
        self.assertEqual(res.status_code, 404)

    # ── 3. Smart Asset Upload & Boundary Detection ─────────────────────────────

    def test_upload_image_smart_hash_match(self):
        repo_dir = self.base_dir / "git-repo"
        (repo_dir / ".git").mkdir(parents=True)
        doc_dir = repo_dir / "docs"
        doc_dir.mkdir()
        doc_path = doc_dir / "guide.md"
        doc_path.write_text("# Guide", encoding="utf-8")

        # Existing figure already in the repo
        existing_figures = repo_dir / "assets" / "diagrams"
        existing_figures.mkdir(parents=True)
        existing_file = existing_figures / "arch.png"
        raw_bytes = b"\x89PNG\r\n\x1a\nArchDiagramBytes"
        existing_file.write_bytes(raw_bytes)

        # Upload a file with the same content
        files = {"file": ("arch.png", io.BytesIO(raw_bytes), "image/png")}
        res = self.client.post(f"/api/images?doc={doc_path}", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Must detect that it already exists in the repo without duplicating!
        self.assertTrue(data["is_existing"])
        self.assertIn("assets/diagrams/arch.png", data["rel_path"])
        # Dest images/ must NOT contain a duplicate
        self.assertFalse((doc_dir / "images" / "arch.png").exists())

    def test_upload_image_new_external_file(self):
        doc_dir = self.base_dir / "standalone"
        doc_dir.mkdir()
        doc_path = doc_dir / "memo.md"
        doc_path.write_text("# Memo", encoding="utf-8")

        new_bytes = b"\x89PNG\r\n\x1a\nBrandNewScreenshot"
        files = {"file": ("screenshot.png", io.BytesIO(new_bytes), "image/png")}
        res = self.client.post(f"/api/images?doc={doc_path}", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertFalse(data["is_existing"])
        self.assertEqual(data["rel_path"], "./images/screenshot.png")
        saved_file = doc_dir / "images" / "screenshot.png"
        self.assertTrue(saved_file.is_file())
        self.assertEqual(saved_file.read_bytes(), new_bytes)

    def test_list_document_images(self):
        folder = self.base_dir / "gallery-doc"
        folder.mkdir()
        doc_path = folder / "post.md"
        doc_path.write_text("# Post with ![fig](./figures/plot.png)", encoding="utf-8")

        figures = folder / "figures"
        figures.mkdir()
        (figures / "plot.png").write_bytes(b"\x89PNG\r\n\x1a\nPlotBytes")

        images_dir = folder / "images"
        images_dir.mkdir()
        (images_dir / "banner.jpg").write_bytes(b"\xff\xd8\xffBannerBytes")

        res = self.client.get(f"/api/images?doc={doc_path}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        filenames = {item["filename"] for item in data}
        self.assertIn("plot.png", filenames)
        self.assertIn("banner.jpg", filenames)

    def test_serve_project_image(self):
        proj_dir = self.projects_dir / "my-photo-proj"
        proj_dir.mkdir()
        img_dir = proj_dir / "images"
        img_dir.mkdir()
        img_path = img_dir / "pic.png"
        img_path.write_bytes(b"\x89PNG\r\n\x1a\nPhotoBytes")

        res = self.client.get("/api/images/pic.png?project=my-photo-proj")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"\x89PNG\r\n\x1a\nPhotoBytes")

    def test_rename_image(self):
        proj_dir = self.projects_dir / "my-rename-proj"
        proj_dir.mkdir()
        img_dir = proj_dir / "images"
        img_dir.mkdir()
        img_path = img_dir / "old-pic.png"
        img_path.write_bytes(b"\x89PNG\r\n\x1a\nPhotoBytes")

        # Rename via PATCH
        res = self.client.patch(
            "/api/images/old-pic.png?project=my-rename-proj",
            json={"new_filename": "new-pic.png"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["filename"], "new-pic.png")
        self.assertFalse(img_path.exists())
        self.assertTrue((img_dir / "new-pic.png").exists())

    # ── 4. Workspace Discovery & PDF Export ─────────────────────────────────────

    def test_get_workspace(self):
        p1 = self.projects_dir / "p1"
        p1.mkdir()
        (p1 / "README.md").write_text("# P1", encoding="utf-8")

        res = self.client.get("/api/workspace")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["projects"]), 1)
        self.assertEqual(data["projects"][0]["name"], "p1")

    def test_export_pdf_with_doc_path(self):
        folder = self.base_dir / "export-test"
        folder.mkdir()
        doc_path = folder / "doc.md"
        doc_path.write_text("# PDF Title", encoding="utf-8")

        payload = {
            "markdown": "# PDF Title\n\nSome text here.",
            "css": "h1 { color: red; }",
            "filename": "test-doc",
            "doc_path": str(doc_path),
        }
        res = self.client.post("/api/export", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "application/pdf")
    def test_workspace_active_watch_target_lifecycle(self):
        # 1. By default, active_watch_target is None
        res = self.client.get("/api/workspace")
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json().get("active_watch_target"))

        # 2. Setting app.state.initial_watch_file returns the active watch target
        dummy_file = self.base_dir / "watched.md"
        dummy_file.write_text("# Watched", encoding="utf-8")
        app.state.initial_watch_file = dummy_file

        try:
            res = self.client.get("/api/workspace")
            self.assertEqual(res.status_code, 200)
            target = res.json().get("active_watch_target")
            self.assertIsNotNone(target)
            self.assertEqual(target["path"], str(dummy_file))
            self.assertEqual(target["filename"], "watched.md")
        finally:
            app.state.initial_watch_file = None

        # 3. Environment variable EDITOR_WATCH_FILE does NOT affect active_watch_target
        os.environ["EDITOR_WATCH_FILE"] = str(dummy_file)
        try:
            res = self.client.get("/api/workspace")
            self.assertEqual(res.status_code, 200)
            self.assertIsNone(res.json().get("active_watch_target"))
        finally:
            os.environ.pop("EDITOR_WATCH_FILE", None)

    def test_get_document_project_mode_with_file_param(self):
        proj_dir = self.projects_dir / "demo-proj-alias"
        proj_dir.mkdir()
        doc = proj_dir / "chapter.md"
        doc.write_text("# Chapter Content", encoding="utf-8")

        res = self.client.get("/api/document?mode=project&project=demo-proj-alias&file=chapter.md")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mode"], "project")
        self.assertEqual(data["markdown"], "# Chapter Content")

    def test_index_serves_launcher_when_watch_file_set(self):
        dummy_file = self.base_dir / "cli_watch.md"
        dummy_file.write_text("# Watched", encoding="utf-8")

        app.state.initial_watch_file = dummy_file
        try:
            res = self.client.get("/", follow_redirects=False)
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/html", res.headers["content-type"])
        finally:
            app.state.initial_watch_file = None


if __name__ == "__main__":
    unittest.main()


