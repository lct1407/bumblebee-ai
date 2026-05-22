"""WebSocket route — live event streaming. /ws?project=bb"""
from __future__ import annotations
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from bumblebee.services.websocket.manager import get_manager

router = APIRouter()


@router.websocket("/ws")
async def ws_stream(websocket: WebSocket, project: str = Query("bb")):
    """Subscribe to project event stream.

    Client receives JSON events: {type, payload, issue_id, occurred_at, ...}.
    Heartbeat: client may send "ping" to keep alive.
    """
    mgr = get_manager()
    await mgr.connect(websocket, project)
    try:
        # Send initial hello
        await websocket.send_json({"type": "ws_hello", "project": project})
        # Keep connection alive; consume client messages (pings, future commands)
        while True:
            try:
                msg = await websocket.receive_text()
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await mgr.disconnect(websocket)
