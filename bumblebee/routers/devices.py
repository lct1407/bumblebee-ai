"""Device pairing + heartbeat — Phase G.

Flow:
  1. CLI: POST /api/devices/pair-request    body={name, capabilities, hostname, platform}
                                            -> returns pairing_code (8 alphanum, 10-min TTL)
  2. User opens web UI, confirms code:
     POST /api/devices/pair-confirm/{code}  (auth'd as workspace member)
                                            -> activates node + returns raw node_token (one-time)
  3. CLI stores token in ~/.bumblebee/node.json
  4. Daemon: POST /api/devices/heartbeat    Authorization: Bearer <node_token>
                                            -> refresh last_heartbeat_at, ip_last_seen

Node tokens have prefix `nt_` and are SHA-256 hashed at rest.
"""
from __future__ import annotations

import hashlib
import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.agent_node import AgentNode, NodeStatus
from bumblebee.services.rbac.dependencies import CurrentWorkspace, require_permission
from bumblebee.services.rbac.permissions import Permission

router = APIRouter(prefix="/api/devices", tags=["devices"])

PAIRING_CODE_TTL_SECONDS = 600  # 10 minutes
NODE_TOKEN_PREFIX = "nt_"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _gen_pairing_code() -> str:
    return "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))


def _gen_node_token() -> str:
    return NODE_TOKEN_PREFIX + secrets.token_urlsafe(32)


# ---- Schemas ---------------------------------------------------------------


class PairRequestBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    capabilities: list[str] = Field(default_factory=list)
    hostname: str | None = None
    platform: str | None = None
    workspace_slug: str | None = None  # CLI passes slug, server resolves


class PairRequestResponse(BaseModel):
    pairing_code: str
    expires_at: datetime
    node_id: uuid.UUID


class PairConfirmResponse(BaseModel):
    node_id: uuid.UUID
    name: str
    node_token: str  # raw token shown ONCE


class NodeOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    capabilities: list[str]
    platform: str | None
    hostname: str | None
    last_heartbeat_at: datetime | None
    created_at: datetime


class HeartbeatBody(BaseModel):
    capabilities: list[str] | None = None
    ip: str | None = None
    # BB-17: daemon-side repo manifest discovered at startup or rescan
    repos_discovered: list[dict] | None = None
    # e.g. [{"path": "/home/u/code/bb", "remote": "github.com/lct1407/bumblebee", "branch": "master"}]


class BindProjectsBody(BaseModel):
    project_ids: list[uuid.UUID]


# ---- Pair request: unauthenticated (CLI initiates) -------------------------


@router.post("/pair-request", response_model=PairRequestResponse)
async def pair_request(body: PairRequestBody, db: AsyncSession = Depends(get_db)):
    """Step 1: CLI requests pairing. Returns code that user reads off the CLI screen.

    No auth — the workspace gets resolved later in pair-confirm (where the user is auth'd).
    To anchor the node to a workspace we accept workspace_slug; the confirm step verifies
    the confirming user has access to that workspace.
    """
    from bumblebee.models.workspace import Workspace

    ws_id: uuid.UUID | None = None
    if body.workspace_slug:
        ws = (
            await db.execute(select(Workspace).where(Workspace.slug == body.workspace_slug))
        ).scalar_one_or_none()
        if ws:
            ws_id = ws.id
    if ws_id is None:
        # Fallback to first workspace (single-tenant local dev)
        ws = (await db.execute(select(Workspace).order_by(Workspace.created_at.asc()).limit(1))).scalar_one_or_none()
        if not ws:
            raise HTTPException(503, "no_workspace")
        ws_id = ws.id

    code = _gen_pairing_code()
    node = AgentNode(
        workspace_id=ws_id,
        name=body.name,
        status=NodeStatus.PENDING,
        pairing_code=code,
        capabilities=body.capabilities,
        platform=body.platform,
        hostname=body.hostname,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    expires = node.created_at + timedelta(seconds=PAIRING_CODE_TTL_SECONDS)
    return PairRequestResponse(pairing_code=code, expires_at=expires, node_id=node.id)


# ---- Pair confirm: authenticated (web UI) ----------------------------------


@router.post("/pair-confirm/{code}", response_model=PairConfirmResponse)
async def pair_confirm(
    code: str,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_NODES)),
    db: AsyncSession = Depends(get_db),
):
    """Step 2: Authenticated workspace admin confirms the pairing code.

    Issues a long-lived node_token (raw, returned once). Server stores only SHA-256.
    """
    node = (
        await db.execute(
            select(AgentNode).where(
                AgentNode.pairing_code == code,
                AgentNode.workspace_id == ws_ctx.workspace_id,
                AgentNode.status == NodeStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if not node:
        raise HTTPException(404, "code_not_found_or_expired")

    age = datetime.now(UTC) - node.created_at
    if age.total_seconds() > PAIRING_CODE_TTL_SECONDS:
        node.status = NodeStatus.REVOKED
        await db.commit()
        raise HTTPException(410, "pairing_code_expired")

    raw_token = _gen_node_token()
    node.token_hash = _hash_token(raw_token)
    node.pairing_code = None
    node.status = NodeStatus.ACTIVE
    await db.commit()
    return PairConfirmResponse(node_id=node.id, name=node.name, node_token=raw_token)


# ---- Node-authenticated endpoints ------------------------------------------


async def _node_from_token(
    db: AsyncSession,
    authorization: str | None,
) -> AgentNode:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing_bearer")
    raw = authorization[7:]
    if not raw.startswith(NODE_TOKEN_PREFIX):
        raise HTTPException(401, "not_a_node_token")
    h = _hash_token(raw)
    node = (
        await db.execute(
            select(AgentNode).where(AgentNode.token_hash == h, AgentNode.status == NodeStatus.ACTIVE)
        )
    ).scalar_one_or_none()
    if not node:
        raise HTTPException(401, "invalid_node_token")
    return node


@router.post("/heartbeat")
async def heartbeat(
    body: HeartbeatBody,
    request: Request,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Worker daemon pings every N seconds. Refreshes last_heartbeat_at."""
    node = await _node_from_token(db, authorization)
    node.last_heartbeat_at = datetime.now(UTC)
    if body.capabilities is not None:
        node.capabilities = body.capabilities
    client_ip = body.ip or (request.client.host if request.client else None)
    if client_ip:
        node.ip_last_seen = client_ip
    # BB-17: persist repo manifest into settings.repos_discovered so admin UI
    # can show which projects this device can serve.
    if body.repos_discovered is not None:
        new_settings = dict(node.settings or {})
        new_settings["repos_discovered"] = body.repos_discovered
        node.settings = new_settings
    await db.commit()
    return {"ok": True, "node_id": str(node.id), "workspace_id": str(node.workspace_id)}


@router.post("/{node_id}/bind-projects")
async def bind_projects(
    node_id: uuid.UUID,
    body: BindProjectsBody,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_NODES)),
    db: AsyncSession = Depends(get_db),
):
    """BB-16: bind a device to one or more projects.

    Task router will only route tasks whose required_project_id is in this list
    to this device.
    """
    node = await db.get(AgentNode, node_id)
    if not node or node.workspace_id != ws_ctx.workspace_id:
        raise HTTPException(404, "node_not_found")
    node.bound_project_ids = [str(p) for p in body.project_ids]
    await db.commit()
    return {"ok": True, "bound_project_ids": node.bound_project_ids}


# ---- Admin: list / revoke --------------------------------------------------


@router.get("", response_model=list[NodeOut])
async def list_nodes(
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_NODES)),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(AgentNode)
            .where(AgentNode.workspace_id == ws_ctx.workspace_id)
            .order_by(AgentNode.created_at.desc())
        )
    ).scalars().all()
    return [
        NodeOut(
            id=n.id, name=n.name, status=n.status.value,
            capabilities=n.capabilities or [], platform=n.platform,
            hostname=n.hostname, last_heartbeat_at=n.last_heartbeat_at,
            created_at=n.created_at,
        )
        for n in rows
    ]


@router.post("/{node_id}/revoke")
async def revoke_node(
    node_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_NODES)),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(AgentNode, node_id)
    if not node or node.workspace_id != ws_ctx.workspace_id:
        raise HTTPException(404, "node_not_found")
    node.status = NodeStatus.REVOKED
    node.token_hash = None
    await db.commit()
    return {"ok": True}
