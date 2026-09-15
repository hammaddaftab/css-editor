import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from starlette.testclient import TestClient


class TestTelemetry(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name)
        self.config_dir = self.base_path / "config"
        self.projects_dir = self.base_path / "projects"
        os.environ["EDITOR_CONFIG_DIR"] = str(self.config_dir)

        from app.main import app
        self.client = TestClient(app)

    def tearDown(self):
        self.temp_dir.cleanup()
        os.environ.pop("EDITOR_CONFIG_DIR", None)

    def test_distinct_id_persistence_and_stability(self):
        from app.routers.telemetry import get_backend_distinct_id
        from app.services.config_manager import load_user_config

        id1 = get_backend_distinct_id()
        id2 = get_backend_distinct_id()
        self.assertEqual(id1, id2)
        self.assertTrue(len(id1) >= 16)

        config, exists = load_user_config()
        self.assertEqual(config.anonymous_id, id1)

    def test_ingest_telemetry_injects_api_key_and_distinct_id(self):
        from app.routers.telemetry import POSTHOG_API_KEY, get_backend_distinct_id

        sent_payloads = []

        async def fake_post(url, json=None, **kwargs):
            sent_payloads.append(dict(json))
            mock_resp = AsyncMock()
            mock_resp.status_code = 200
            mock_resp.text = '{"status":"Ok"}'
            return mock_resp

        with patch("httpx.AsyncClient.post", side_effect=fake_post):
            res = self.client.post("/api/telemetry", json={
                "event": "export_clicked",
                "properties": {
                    "project": "my-project",
                    "filename": "doc.md",
                    "integrity": "SGVsbG8gV29ybGQ=",
                }
            })
            self.assertEqual(res.status_code, 204)

        self.assertEqual(len(sent_payloads), 1)
        payload = sent_payloads[0]
        distinct_id = get_backend_distinct_id()

        self.assertEqual(payload["api_key"], POSTHOG_API_KEY)
        self.assertEqual(payload["event"], "export_clicked")
        self.assertEqual(payload["properties"]["distinct_id"], distinct_id)
        self.assertEqual(payload["properties"]["project"], "my-project")
        self.assertEqual(payload["properties"]["integrity"], "SGVsbG8gV29ybGQ=")

    def test_track_backend_event_payload_structure(self):
        from app.routers.telemetry import POSTHOG_API_KEY, get_backend_distinct_id, track_backend_event

        sent_payloads = []

        async def fake_post(url, json=None, **kwargs):
            sent_payloads.append(dict(json))
            mock_resp = AsyncMock()
            mock_resp.status_code = 200
            mock_resp.text = '{"status":"Ok"}'
            return mock_resp

        async def runner():
            with patch("httpx.AsyncClient.post", side_effect=fake_post):
                task = track_backend_event("app_opened", {"app_name": "CSS Markdown Editor"})
                self.assertIsNotNone(task)
                if task:
                    await task

        asyncio.run(runner())

        self.assertEqual(len(sent_payloads), 1)
        payload = sent_payloads[0]
        self.assertEqual(payload["event"], "app_opened")
        self.assertEqual(payload["api_key"], POSTHOG_API_KEY)
        self.assertEqual(payload["properties"]["distinct_id"], get_backend_distinct_id())
        self.assertEqual(payload["properties"]["app_name"], "CSS Markdown Editor")
        self.assertEqual(payload["properties"]["$lib"], "css-editor-backend")


if __name__ == "__main__":
    unittest.main()
