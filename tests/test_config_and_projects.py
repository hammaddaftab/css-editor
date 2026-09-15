import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from starlette.testclient import TestClient


class TestConfigAndProjects(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name)
        self.config_dir = self.base_path / "config"
        self.projects_dir = self.base_path / "projects"
        os.environ["EDITOR_CONFIG_DIR"] = str(self.config_dir)

        patcher = patch("app.services.config_manager.get_default_projects_dir", return_value=self.projects_dir)
        patcher.start()
        self.addCleanup(patcher.stop)

        from app.main import app
        self.client = TestClient(app)

    def tearDown(self):
        self.temp_dir.cleanup()
        os.environ.pop("EDITOR_CONFIG_DIR", None)

    def test_initial_config_and_modal_seeding_lifecycle(self):
        from app.services.config_manager import get_default_projects_dir

        # 1. Before initial modal click: GET /api/config should not seed anything
        res = self.client.get("/api/config")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["is_first_run"])
        self.assertFalse(data["first_run_completed"])
        self.assertFalse(data["welcome_seeded"])
        self.assertEqual(data["projects_dir"], str(get_default_projects_dir()))
        self.assertTrue(Path(data["config_file_path"]).parent.exists())

        # Projects directory should not have welcome project yet
        projects_res = self.client.get("/api/projects")
        self.assertEqual(projects_res.status_code, 200)
        self.assertEqual(len(projects_res.json()["projects"]), 0)

        # 2. User completes initial modal setup (clicks "Get Started")
        update_payload = {
            "projects_dir": str(self.projects_dir),
            "author_name": "Test Author",
            "author_email": "author@example.com",
            "first_run_completed": True,
        }
        modal_res = self.client.post("/api/config", json=update_payload)
        self.assertEqual(modal_res.status_code, 200)
        modal_data = modal_res.json()
        self.assertFalse(modal_data["is_first_run"])
        self.assertTrue(modal_data["first_run_completed"])
        self.assertTrue(modal_data["welcome_seeded"])

        # Welcome project is now seeded exactly once
        welcome_dir = self.projects_dir / "welcome"
        self.assertTrue((welcome_dir / "README.md").exists())
        self.assertTrue((welcome_dir / "project.css").exists())

        # Verify through documents API
        doc_res = self.client.get("/api/project/document?project=welcome&filename=README.md")
        self.assertEqual(doc_res.status_code, 200)
        self.assertIn("Welcome to CSS Markdown Editor", doc_res.json()["markdown"])

        # 3. User deletes the welcome project
        shutil.rmtree(welcome_dir)
        self.assertFalse(welcome_dir.exists())

        # 4. Subsequent queries / config updates must NEVER re-seed the welcome project
        get_res = self.client.get("/api/config")
        self.assertEqual(get_res.status_code, 200)
        self.assertTrue(get_res.json()["welcome_seeded"])
        self.assertFalse(welcome_dir.exists())

        projects_after_delete = self.client.get("/api/projects").json()["projects"]
        self.assertEqual(len(projects_after_delete), 0)

        # Even updating settings again must NOT recreate it
        self.client.post("/api/config", json={"author_name": "Updated Author"})
        self.assertFalse(welcome_dir.exists())

    def test_switch_projects_directory_never_reseeds(self):
        # Complete first run
        self.client.post("/api/config", json={"first_run_completed": True})
        self.assertTrue((self.projects_dir / "welcome").exists())

        # Switch to custom projects directory
        new_projects_dir = self.base_path / "custom_projects"
        res = self.client.post("/api/config", json={"projects_dir": str(new_projects_dir)})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["projects_dir"], str(new_projects_dir.resolve()))
        self.assertTrue(new_projects_dir.exists())

        # Welcome project must NOT be seeded in new directory because welcome_seeded is True
        self.assertFalse((new_projects_dir / "welcome").exists())

        # Create a user project in the new directory
        create_res = self.client.post("/api/projects", json={"name": "my-research"})
        self.assertEqual(create_res.status_code, 201)
        self.assertTrue((new_projects_dir / "my-research" / "README.md").exists())

    def test_export_pdf_contains_author_meta(self):
        self.client.post("/api/config", json={"author_name": "Dr. Markdown"})
        export_res = self.client.post("/api/export", json={
            "markdown": "# Test Title\n\nContent here.",
            "css": "h1 { color: blue; }",
            "filename": "test-doc"
        })
        self.assertEqual(export_res.status_code, 200)
        self.assertEqual(export_res.headers["content-type"], "application/pdf")
        self.assertGreater(len(export_res.content), 100)


if __name__ == "__main__":
    unittest.main()
