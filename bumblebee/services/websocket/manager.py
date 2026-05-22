"""WebSocket connection manager — broadcasts events to subscribed clients.

Phase 7 commercial: enables real-time event streaming to web UI (eliminating 3s poll).
Subscribers can filter by project_slug or issue_id.
"""
from __future__ import annotations
import asyncio
import json
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """In-memory WS connection registry + broadcast helper.

    Each connection can subscribe to a project slug. Future: per-issue filter.
    """

    def __init__(self) -> None:
        # project_slug -> set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        # WebSocket -> project_slug
        self._reverse: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, project_slug: str) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[project_slug].add(ws)
            self._reverse[ws] = project_slug

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            slug = self._reverse.pop(ws, None)
            if slug:
                self._connections[slug].discard(ws)

    async def broadcast(self, project_slug: str, event: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.get(project_slug, set()))
        dead = []
        msg = json.dumps(event, default=str)
        for ws in targets:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    def stats(self) -> dict:
        return {
            "total_connections": sum(len(s) for s in self._connections.values()),
            "by_project": {k: len(v) for k, v in self._connections.items()},
        }


_manager: ConnectionManager | None = None


def get_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager
