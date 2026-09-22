import socket
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from app.cli import build_parser, find_available_port
from app.core.config import get_bundle_dir, settings


class TestCliAndBundlePaths(unittest.TestCase):
    def test_get_bundle_dir_normal_mode(self):
        # In normal mode, get_bundle_dir() should return the repository root containing 'app'
        bundle_dir = get_bundle_dir()
        self.assertTrue((bundle_dir / "app").is_dir())
        self.assertTrue((bundle_dir / "templates").is_dir())
        self.assertTrue((bundle_dir / "static").is_dir())

    def test_get_bundle_dir_frozen_mode(self):
        # In frozen mode (PyInstaller), sys.frozen=True and sys._MEIPASS is set
        fake_meipass = "/tmp/fake_mei_test_dir"
        with patch.object(sys, "frozen", True, create=True), patch.object(
            sys, "_MEIPASS", fake_meipass, create=True
        ):
            bundle_dir = get_bundle_dir()
            self.assertEqual(bundle_dir, Path(fake_meipass).resolve())

    def test_find_available_port_free(self):
        # Find an open port and check that find_available_port returns it when free
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            free_port = s.getsockname()[1]

        chosen = find_available_port(preferred_port=free_port)
        self.assertEqual(chosen, free_port)

    def test_find_available_port_busy_fallback(self):
        # Occupy a port, then ensure find_available_port picks a different available port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupier:
            occupier.bind(("127.0.0.1", 0))
            busy_port = occupier.getsockname()[1]

            chosen = find_available_port(preferred_port=busy_port)
            self.assertNotEqual(chosen, busy_port)
            self.assertGreater(chosen, 0)

    def test_cli_parser_defaults(self):
        parser = build_parser()
        args = parser.parse_args([])
        self.assertEqual(args.host, "127.0.0.1")
        self.assertEqual(args.port, 8000)
        self.assertFalse(args.no_browser)
        self.assertIsNone(args.watch)

    def test_cli_parser_custom_options(self):
        parser = build_parser()
        args = parser.parse_args(["--port", "9090", "--host", "0.0.0.0", "--no-browser", "--watch", "test.md"])
        self.assertEqual(args.host, "0.0.0.0")
        self.assertEqual(args.port, 9090)
        self.assertTrue(args.no_browser)
        self.assertEqual(args.watch, "test.md")

        # Test -w short alias
        args_short = parser.parse_args(["-w", "notes.md"])
        self.assertEqual(args_short.watch, "notes.md")

    def test_images_endpoint_document_scoped(self):
        import io
        import tempfile
        from starlette.testclient import TestClient

        temp_dir = tempfile.TemporaryDirectory()
        doc_path = Path(temp_dir.name) / "document.md"
        doc_path.write_text("# Doc", encoding="utf-8")

        try:
            from app.main import app
            client = TestClient(app)

            # 1. Missing doc param -> 422
            res = client.get("/api/images")
            self.assertEqual(res.status_code, 422)

            # 2. Upload image to document
            fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
            upload_res = client.post(
                f"/api/images?doc={doc_path}",
                files={"file": ("test.png", io.BytesIO(fake_png), "image/png")},
            )
            self.assertEqual(upload_res.status_code, 200)
            data = upload_res.json()
            filename = data["filename"]
            self.assertIn("/api/assets/", data["url"])

            # 3. List images for document
            list_res = client.get(f"/api/images?doc={doc_path}")
            self.assertEqual(list_res.status_code, 200)
            self.assertEqual(len(list_res.json()), 1)
            self.assertEqual(list_res.json()[0]["filename"], filename)

            # 4. Serve image
            serve_res = client.get(f"/api/images/{filename}?doc={doc_path}")
            self.assertEqual(serve_res.status_code, 200)
            self.assertEqual(serve_res.content, fake_png)

            # 5. Delete image
            del_res = client.delete(f"/api/images/{filename}?doc={doc_path}")
            self.assertEqual(del_res.status_code, 200)

            # 6. List again should be empty
            list_empty = client.get(f"/api/images?doc={doc_path}")
            self.assertEqual(len(list_empty.json()), 0)
        finally:
            temp_dir.cleanup()

    def test_pages_conditional_get_lifecycle(self):
        from starlette.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        # Initial request: 200 OK with Last-Modified, ETag, Content-Length
        res1 = client.get("/")
        self.assertEqual(res1.status_code, 200)
        self.assertIn("last-modified", res1.headers)
        self.assertIn("etag", res1.headers)
        self.assertIn("content-length", res1.headers)
        self.assertGreater(len(res1.content), 0)

        etag = res1.headers["etag"]
        last_mod = res1.headers["last-modified"]

        # Conditional request with matching ETag and If-Modified-Since: 304 Not Modified
        res2 = client.get("/", headers={"if-none-match": etag, "if-modified-since": last_mod})
        self.assertEqual(res2.status_code, 304)
        self.assertEqual(len(res2.content), 0)
        self.assertEqual(res2.headers.get("etag"), etag)
        self.assertEqual(res2.headers.get("last-modified"), last_mod)

    def test_cli_check_flag(self):
        from app.cli import main
        # main(["--check"]) completes cleanly and returns None
        self.assertIsNone(main(["--check"]))


if __name__ == "__main__":
    unittest.main()
