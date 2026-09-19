"""Unit and integration tests for watch mode architectural separation.

Verifies:
1. Orchestrator layer whose job is only detecting watch mode (CLI flag vs frontend call).
2. Activation via CLI flag and via frontend API calls.
3. Standalone WatchModeHandler layer with atomic save handling.
4. ProjectWatcherHandler layer watching the respective project directory only.
5. Self-contained lifecycle and cleanup in both WatchModeHandler and ProjectWatcherHandler.
"""
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.testclient import TestClient

from app.main import app
from app.models.context import ProjectDocumentContext, WatchDocumentContext
from app.services.broadcaster import broadcaster
from app.services.watcher import (
    ProjectWatcherHandler,
    WatchModeHandler,
    WatchOrchestrator,
    watch_orchestrator,
)


class TestWatchModeSeparation(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name).resolve()
        self.projects_dir = self.base_dir / "projects"
        self.projects_dir.mkdir()

        # Dedicated queue for SSE events
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        broadcaster.add_client(self.queue)

    async def asyncTearDown(self):
        broadcaster.remove_client(self.queue)
        await watch_orchestrator.shutdown()
        self.temp_dir.cleanup()

    # ── 1. Orchestrator Detection Tests ────────────────────────────────────────

    async def test_orchestrator_detects_cli_flag(self):
        """Orchestrator detects CLI watch flag on boot and coordinates transition."""
        cli_file = self.base_dir / "cli_test.md"
        cli_file.write_text("# CLI Note", encoding="utf-8")

        watch_handler = WatchModeHandler()
        project_handler = ProjectWatcherHandler()
        orchestrator = WatchOrchestrator(watch_handler, project_handler)

        try:
            # Detect CLI flag pointing to existing file
            activated = await orchestrator.detect_cli_watch(cli_file)
            self.assertTrue(activated)
            self.assertEqual(orchestrator.current_mode, "watch")
            self.assertEqual(orchestrator.current_doc, cli_file.resolve())
            self.assertTrue(watch_handler.is_active)
            self.assertFalse(project_handler.is_active)

            # Test non-existent file
            non_existent = self.base_dir / "does_not_exist.md"
            self.assertFalse(await orchestrator.detect_cli_watch(non_existent))

        finally:
            await orchestrator.shutdown()

    async def test_orchestrator_detects_frontend_mode_transitions(self):
        """Orchestrator detects frontend mode calls and coordinates mutual exclusivity."""
        watch_handler = WatchModeHandler()
        project_handler = ProjectWatcherHandler()
        orchestrator = WatchOrchestrator(watch_handler, project_handler)

        doc_path = self.base_dir / "standalone.md"
        doc_path.write_text("# Standalone", encoding="utf-8")
        watch_context = WatchDocumentContext(
            doc_path=doc_path,
            css_path=doc_path.with_suffix(".css"),
            images_dir=self.base_dir / "images",
        )

        proj_dir = self.projects_dir / "my-project"
        proj_dir.mkdir()
        proj_context = ProjectDocumentContext(
            doc_path=proj_dir / "README.md",
            project_dir=proj_dir,
            project_name="my-project",
            css_path=proj_dir / "README.css",
            images_dir=proj_dir / "images",
        )

        try:
            # 1. Detect watch mode
            await orchestrator.detect_and_activate(watch_context)
            self.assertEqual(orchestrator.current_mode, "watch")
            self.assertTrue(watch_handler.is_active)
            self.assertFalse(project_handler.is_active)
            self.assertEqual(orchestrator.current_doc, doc_path.resolve())

            # 2. Detect transition to project mode
            await orchestrator.detect_and_activate(proj_context)
            self.assertEqual(orchestrator.current_mode, "project")
            self.assertFalse(watch_handler.is_active)
            self.assertTrue(project_handler.is_active)
            self.assertEqual(orchestrator.current_project, "my-project")
            self.assertIsNone(orchestrator.current_doc)

            # 3. Detect transition back to watch mode
            await orchestrator.detect_and_activate(watch_context)
            self.assertEqual(orchestrator.current_mode, "watch")
            self.assertTrue(watch_handler.is_active)
            self.assertFalse(project_handler.is_active)

        finally:
            await orchestrator.shutdown()

    # ── 2. Standalone WatchModeHandler & Contained Cleanup ─────────────────────

    async def test_watch_mode_handler_self_contained_cleanup(self):
        """WatchModeHandler contains its own lifecycle and cleanup cleanly."""
        handler = WatchModeHandler()
        doc_path = self.base_dir / "paper.md"
        doc_path.write_text("# Paper", encoding="utf-8")
        context = WatchDocumentContext(
            doc_path=doc_path,
            css_path=doc_path.with_suffix(".css"),
            images_dir=self.base_dir / "images",
        )

        self.assertFalse(handler.is_active)
        self.assertIsNone(handler.current_doc)

        await handler.start(context)
        self.assertTrue(handler.is_active)
        self.assertEqual(handler.current_doc, doc_path.resolve())

        # Verify self-contained cleanup
        await handler.stop()
        self.assertFalse(handler.is_active)
        self.assertIsNone(handler.current_doc)
        self.assertIsNone(handler.context)

        # Repeated cleanup is safe (idempotent)
        await handler.cleanup()
        self.assertFalse(handler.is_active)

    # ── 3. ProjectWatcherHandler: Watches Respective Project Only ──────────────

    async def test_project_watcher_watches_respective_project_only(self):
        """ProjectWatcherHandler strictly watches the active project directory only."""
        proj_a = self.projects_dir / "project-a"
        proj_b = self.projects_dir / "project-b"
        proj_a.mkdir()
        proj_b.mkdir()

        file_a = proj_a / "README.md"
        file_b = proj_b / "README.md"
        file_a.write_text("# Project A Initial", encoding="utf-8")
        file_b.write_text("# Project B Initial", encoding="utf-8")

        handler = ProjectWatcherHandler()
        await handler.start("project-a", proj_a)

        self.assertTrue(handler.is_active)
        self.assertEqual(handler.current_project, "project-a")
        self.assertEqual(handler.current_project_dir, proj_a.resolve())

        await asyncio.sleep(0.35)  # Wait for watchfiles initialization

        try:
            # Modify file in Project B (should NOT trigger events)
            file_b.write_text("# Project B Updated", encoding="utf-8")
            await asyncio.sleep(0.4)

            events_b = []
            while not self.queue.empty():
                events_b.append(self.queue.get_nowait())

            # No events for project-b because it watches respective project only
            for evt in events_b:
                self.assertNotIn("project-b", evt)

            # Modify file in Project A (SHOULD trigger event)
            file_a.write_text("# Project A Modified", encoding="utf-8")

            received = None
            for _ in range(10):
                try:
                    msg = await asyncio.wait_for(self.queue.get(), timeout=2.0)
                    if "project-a" in msg:
                        received = msg
                        break
                except asyncio.TimeoutError:
                    break

            self.assertIsNotNone(received, "Did not receive event for Project A")
            self.assertIn("Project A Modified", received)

        finally:
            # Verify self-contained cleanup
            await handler.stop()
            self.assertFalse(handler.is_active)
            self.assertIsNone(handler.current_project)
            self.assertIsNone(handler.current_project_dir)

            # Repeated stop is idempotent
            await handler.cleanup()
            self.assertFalse(handler.is_active)

    # ── 4. End-to-End API Mode Switching Integration ──────────────────────────

    def test_api_document_endpoint_triggers_orchestrator(self):
        """GET /api/document calls trigger orchestrator mode detection and transition."""
        client = TestClient(app)

        with patch("app.routers.documents.get_projects_root", return_value=self.projects_dir):
            # Create a project document
            proj_dir = self.projects_dir / "web-app"
            proj_dir.mkdir()
            (proj_dir / "README.md").write_text("# Web App", encoding="utf-8")

            # 1. Frontend requests project document -> orchestrator enters project mode
            res = client.get("/api/document?mode=project&project=web-app&filename=README.md")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(watch_orchestrator.current_mode, "project")
            self.assertEqual(watch_orchestrator.current_project, "web-app")
            self.assertIsNone(watch_orchestrator.current_doc)

            # 2. Frontend requests standalone watched document -> orchestrator enters watch mode
            ext_doc = self.base_dir / "external.md"
            ext_doc.write_text("# External Paper", encoding="utf-8")
            res_watch = client.get(f"/api/document?mode=watch&path={ext_doc}")
            self.assertEqual(res_watch.status_code, 200)
            self.assertEqual(watch_orchestrator.current_mode, "watch")
            self.assertEqual(watch_orchestrator.current_doc, ext_doc.resolve())
            self.assertIsNone(watch_orchestrator.current_project)


if __name__ == "__main__":
    unittest.main()
