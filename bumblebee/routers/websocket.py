"""WebSocket route — live event streaming. /ws?project=<slug>

Phase E security gate: connections REQUIRE auth via JWT or API key, AND the
caller must be a member of the requested project's workspace. Anonymous connects
return code 4001 (close).

Auth source order:
  1. ?token=<JWT>     (web UI — token is a normal Bearer JWT)
  2. ?api_key=<key>   (CLI daemon — same key as REST X-BB-API-Key)
"""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from bumblebee.auth.security import decode_access_token, hash_api_key
from bumblebee.database import SessionLocal
from bumblebee.models.project import Project
from bumblebee.models.user import ApiKey, User
from bumblebee.models.workspace import WorkspaceMember
from bumblebee.services.websocket.manager import get_manager

router = APIRouter()


CLOSE_UNAUTHORIZED = 4001
CLOSE_FORBIDDEN = 4003
CLOSE_NOT_FOUND = 4004


async def _resolve_caller_workspace(token: str | None, api_key: str | None) -> tuple[str, str] | None:
    """Return (user_id, workspace_id) if auth resolves; None otherwise.

    user_id is None for API-key auth without a bound user (system key).
    """
    async with SessionLocal() as db:
        if token:
            payload = decode_access_token(token)
            if payload:
                user_id = payload.get("sub")
                claimed_ws = payload.get("ws")
                if user_id:
                    # Verify the user exists and (if claim present) is still a member
                    if claimed_ws:
                        member = (
                            await db.execute(
                                select(WorkspaceMember).where(
                                    WorkspaceMember.user_id == user_id,
                                    WorkspaceMember.workspace_id == claimed_ws,
                                )
                            )
                        ).scalar_one_or_none()
                        if member:
                            return user_id, str(member.workspace_id)
                    # Fallback: any membership
                    member = (
                        await db.execute(
                            select(WorkspaceMember)
                            .where(WorkspaceMember.user_id == user_id)
                            .order_by(WorkspaceMember.created_at.asc())
                            .limit(1)
                        )
                    ).scalar_one_or_none()
                    if member:
                        return user_id, str(member.workspace_id)
        if api_key:
            key = (
                await db.execute(
                    select(ApiKey).where(
                        ApiKey.key_hash == hash_api_key(api_key),
                        ApiKey.is_active == True,
                    )
                )
            ).scalar_one_or_none()
            if key and key.user_id:
                member = (
                    await db.execute(
                        select(WorkspaceMember)
                        .where(WorkspaceMember.user_id == key.user_id)
                        .order_by(WorkspaceMember.created_at.asc())
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if member:
                    return str(key.user_id), str(member.workspace_id)
    return None


async def _project_workspace_id(slug: str) -> str | None:
    async with SessionLocal() as db:
        proj = (
            await db.execute(select(Project).where(Project.slug == slug))
        ).scalar_one_or_none()
        return str(proj.workspace_id) if proj else None


@router.websocket("/ws")
async def ws_stream(
    websocket: WebSocket,
    project: str = Query("bb"),
    token: str | None = Query(None, description="JWT bearer token (web UI)"),
    api_key: str | None = Query(None, description="Bumblebee API key (CLI daemon)"),
):
    """Subscribe to project event stream. Requires auth + workspace membership.

    Client receives JSON events: {type, payload, issue_id, occurred_at, ...}.
    Heartbeat: client may send "ping" to keep alive.
    """
    # 1) Resolve caller's workspace
    caller = await _resolve_caller_workspace(token, api_key)
    if not caller:
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="auth required")
        return
    _user_id, caller_ws_id = caller

    # 2) Resolve the project's workspace and check membership
    project_ws_id = await _project_workspace_id(project)
    if not project_ws_id:
        # Don't leak existence — return forbidden, not not-found
        await websocket.close(code=CLOSE_FORBIDDEN, reason="forbidden")
        return
    if project_ws_id != caller_ws_id:
        await websocket.close(code=CLOSE_FORBIDDEN, reason="cross-workspace forbidden")
        return

    # 3) Accept + register
    mgr = get_manager()
    await mgr.connect(websocket, project)
    try:
        await websocket.send_json({"type": "ws_hello", "project": project})
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
