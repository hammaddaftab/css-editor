"""
SSE Event Broadcaster.

Maintains a registry of per-client asyncio.Queue instances and fans out
published events to every connected SSE subscriber.

Usage:
    # In an SSE router
    queue = asyncio.Queue(maxsize=20)
    broadcaster.add_client(queue)
    try:
        ...
    finally:
        broadcaster.remove_client(queue)

    # From anywhere in the app
    await broadcaster.publish("render", {"html": "...", "css": "..."})
"""
import asyncio
import json


class EventBroadcaster:
    def __init__(self) -> None:
        self._clients: list[asyncio.Queue[str]] = []

    # ------------------------------------------------------------------
    # Client registry
    # ------------------------------------------------------------------

    def add_client(self, queue: asyncio.Queue[str]) -> None:
        """Register a new SSE client queue."""
        self._clients.append(queue)

    def remove_client(self, queue: asyncio.Queue[str]) -> None:
        """Unregister a client queue (safe if already removed)."""
        try:
            self._clients.remove(queue)
        except ValueError:
            pass

    @property
    def client_count(self) -> int:
        return len(self._clients)

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    async def publish(self, event_type: str, data: dict) -> None:
        """
        Broadcast an SSE event to all connected clients.

        Events are dropped for clients whose queue is full (back-pressure
        protection) rather than blocking the publisher.
        """
        if not self._clients:
            return

        payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        for queue in list(self._clients):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Slow client — drop the event to avoid blocking
                pass


# Module-level singleton shared across the entire application
broadcaster = EventBroadcaster()
