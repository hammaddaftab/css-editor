"""Unit tests for Phase 3: Directory-level file watcher and atomic save resilience."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

from app.models.context import WatchDocumentContext
from app.services.broadcaster import broadcaster
from app.services.watcher import watch_document


class TestWatcherAtomicSaves(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name).resolve()
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        broadcaster.add_client(self.queue)

    async def asyncTearDown(self):
        broadcaster.remove_client(self.queue)
        self.temp_dir.cleanup()

    async def test_watcher_survives_atomic_save(self):
        """Simulate an external editor (Neovim/Vim) atomic swap (write tmp + rename)."""
        doc_path = self.base_dir / "paper.md"
        css_path = self.base_dir / "paper.css"
        doc_path.write_text("# Initial Version\n", encoding="utf-8")
        css_path.write_text("h1 { color: blue; }\n", encoding="utf-8")

        context = WatchDocumentContext(
            doc_path=doc_path,
            css_path=css_path,
            images_dir=self.base_dir / "images",
        )

        watch_task = asyncio.create_task(watch_document(context))
        await asyncio.sleep(0.35)  # Allow watcher loop to initialize

        try:
            # Perform ATOMIC SAVE: write to temporary file, then rename/replace
            # This replicates Neovim/Vim/VS Code's behavior that replaces the inode.
            temp_swap = self.base_dir / "paper.md.tmp"
            temp_swap.write_text("# Updated via Neovim Atomic Save\n", encoding="utf-8")
            os.replace(temp_swap, doc_path)

            # Wait for SSE event from broadcaster
            received_event = None
            for _ in range(10):
                try:
                    event_str = await asyncio.wait_for(self.queue.get(), timeout=2.0)
                    if "event: document:change" in event_str:
                        received_event = event_str
                        break
                except asyncio.TimeoutError:
                    break

            self.assertIsNotNone(received_event, "Did not receive document:change event after atomic save")
            # Verify payload contains new content
            self.assertIn("Updated via Neovim Atomic Save", received_event)
            self.assertIn("paper.md", received_event)

        finally:
            watch_task.cancel()
            try:
                await watch_task
            except asyncio.CancelledError:
                pass


if __name__ == "__main__":
    unittest.main()
