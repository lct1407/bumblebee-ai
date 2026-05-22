"""WebSocket manager tests — connection registry + broadcast."""
import asyncio
from unittest.mock import AsyncMock

import pytest

from bumblebee.services.websocket.manager import ConnectionManager


class FakeWS:
    def __init__(self):
        self.sent: list[str] = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_text(self, msg: str):
        self.sent.append(msg)


@pytest.mark.asyncio
async def test_connect_registers_websocket():
    mgr = ConnectionManager()
    ws = FakeWS()
    await mgr.connect(ws, "bb")
    assert ws.accepted
    assert mgr.stats()["total_connections"] == 1
    assert mgr.stats()["by_project"]["bb"] == 1


@pytest.mark.asyncio
async def test_broadcast_only_to_project_subscribers():
    mgr = ConnectionManager()
    ws1, ws2, ws3 = FakeWS(), FakeWS(), FakeWS()
    await mgr.connect(ws1, "bb")
    await mgr.connect(ws2, "bb")
    await mgr.connect(ws3, "other")

    await mgr.broadcast("bb", {"type": "test_event"})

    assert len(ws1.sent) == 1
    assert len(ws2.sent) == 1
    assert len(ws3.sent) == 0
    assert "test_event" in ws1.sent[0]


@pytest.mark.asyncio
async def test_disconnect_removes_from_registry():
    mgr = ConnectionManager()
    ws = FakeWS()
    await mgr.connect(ws, "bb")
    await mgr.disconnect(ws)
    assert mgr.stats()["total_connections"] == 0


@pytest.mark.asyncio
async def test_broadcast_with_no_subscribers_does_not_error():
    mgr = ConnectionManager()
    # Should not raise
    await mgr.broadcast("nobody", {"type": "x"})
