"""Workspace + member + invite endpoints.

Surface:
  GET    /api/workspaces                                — list mine
  POST   /api/workspaces                                — create new (owned by me)
  GET    /api/workspaces/{id}                           — details
  PATCH  /api/workspaces/{id}                           — rename/settings (admin+)
  DELETE /api/workspaces/{id}                           — soft-delete (owner only)

  GET    /api/workspaces/{id}/members                   — list (any member)
  POST   /api/workspaces/{id}/invites                   — invite (admin+)
  PATCH  /api/workspaces/{id}/members/{user_id}         — change role (admin+)
  DELETE /api/workspaces/{id}/members/{user_id}         — kick (admin+)

  POST   /api/invites/{token}/accept                    — accept invite (any auth user)
  GET    /api/invites/{token}                           — preview invite (any)
"""
from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.dependencies import get_current_user
from bumblebee.database import get_db
from bumblebee.models.user import User
from bumblebee.models.workspace import (
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
    WorkspaceRole,
)
from bumblebee.services.rbac import (
    CurrentWorkspace,
    Permission,
    require_permission,
    require_workspace,
)

router = APIRouter(tags=["workspaces"])

INVITE_TTL_DAYS = 7


class CreateWorkspaceRequest(BaseModel):
    name: str
    slug: str | None = None


class UpdateWorkspaceRequest(BaseModel):
    name: str | None = None
    settings: dict | None = None


class InviteRequest(BaseModel):
    email: str
    role: WorkspaceRole = WorkspaceRole.MEMBER


class UpdateMemberRequest(BaseModel):
    role: WorkspaceRole


# ---------- Workspace lifecycle ----------


@router.get("/api/workspaces")
async def list_my_workspaces(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user is None:
        return []
    # Earliest-joined first, so the client's "first workspace" default matches the
    # backend's earliest-active fallback in require_workspace.
    memberships = (
        await db.execute(
            select(WorkspaceMember)
            .where(WorkspaceMember.user_id == user.id)
            .order_by(WorkspaceMember.created_at.asc(), WorkspaceMember.id.asc())
        )
    ).scalars().all()
    out = []
    for m in memberships:
        ws = await db.get(Workspace, m.workspace_id)
        if ws and not ws.deleted_at:
            out.append({
                "id": str(ws.id),
                "name": ws.name,
                "slug": ws.slug,
                "plan": ws.plan.value,
                "role": m.role.value,
                "created_at": ws.created_at.isoformat(),
            })
    return out


@router.post("/api/workspaces", status_code=201)
async def create_workspace(
    body: CreateWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user is None:
        raise HTTPException(401, "authentication required")
    from bumblebee.routers.auth import _slugify, _unique_slug

    slug = await _unique_slug(db, body.slug or _slugify(body.name))
    ws = Workspace(name=body.name, slug=slug, owner_user_id=user.id)
    db.add(ws)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.OWNER))
    await db.commit()
    await db.refresh(ws)
    return {"id": str(ws.id), "name": ws.name, "slug": ws.slug, "plan": ws.plan.value, "role": "owner"}


@router.get("/api/workspaces/{ws_id}")
async def get_workspace(
    ws_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_workspace),
    db: AsyncSession = Depends(get_db),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")  # never 404 — don't leak existence
    return {
        "id": str(ws.id),
        "name": ws.name,
        "slug": ws.slug,
        "plan": ws.plan.value,
        "role": ws_ctx.role.value,
        "settings": ws.settings,
        "stripe_customer_id": ws.stripe_customer_id,
        "payment_overdue": ws.payment_overdue,
    }


@router.patch("/api/workspaces/{ws_id}")
async def update_workspace(
    ws_id: uuid.UUID,
    body: UpdateWorkspaceRequest,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_WORKSPACE)),
    db: AsyncSession = Depends(get_db),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")
    if body.name is not None:
        ws.name = body.name
    if body.settings is not None:
        ws.settings = body.settings
    await db.commit()
    return {"id": str(ws.id), "name": ws.name, "slug": ws.slug}


@router.delete("/api/workspaces/{ws_id}", status_code=204)
async def delete_workspace(
    ws_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.DELETE_WORKSPACE)),
    db: AsyncSession = Depends(get_db),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")
    ws.deleted_at = datetime.now(UTC)
    await db.commit()


# ---------- Members ----------


@router.get("/api/workspaces/{ws_id}/members")
async def list_members(
    ws_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_MEMBERS)),
    db: AsyncSession = Depends(get_db),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    rows = (
        await db.execute(
            select(WorkspaceMember).where(WorkspaceMember.workspace_id == ws_id)
        )
    ).scalars().all()
    out = []
    for m in rows:
        u = await db.get(User, m.user_id)
        out.append({
            "user_id": str(m.user_id),
            "username": u.username if u else None,
            "email": u.email if u else None,
            "role": m.role.value,
            "joined_at": m.created_at.isoformat(),
        })
    return out


@router.patch("/api/workspaces/{ws_id}/members/{user_id}")
async def update_member_role(
    ws_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateMemberRequest,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    # Only owner can promote to owner / demote owner (handled via ownership transfer)
    if body.role == WorkspaceRole.OWNER and ws_ctx.role != WorkspaceRole.OWNER:
        raise HTTPException(403, "owner_only")
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(404, "member_not_found")
    member.role = body.role
    await db.commit()
    return {"user_id": str(user_id), "role": member.role.value}


@router.delete("/api/workspaces/{ws_id}/members/{user_id}", status_code=204)
async def remove_member(
    ws_id: uuid.UUID,
    user_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if ws and ws.owner_user_id == user_id:
        raise HTTPException(400, "cannot_remove_owner")
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(404, "member_not_found")
    await db.delete(member)
    await db.commit()


# ---------- Invites ----------


@router.post("/api/workspaces/{ws_id}/invites", status_code=201)
async def create_invite(
    ws_id: uuid.UUID,
    body: InviteRequest,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    # Owner role can only be granted via ownership transfer, not invite
    if body.role == WorkspaceRole.OWNER:
        raise HTTPException(400, "invite_owner_disallowed")
    token = secrets.token_urlsafe(32)
    invite = WorkspaceInvite(
        workspace_id=ws_id,
        email=body.email.lower(),
        role=body.role,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=INVITE_TTL_DAYS),
        invited_by_user_id=user.id,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return {
        "id": str(invite.id),
        "email": invite.email,
        "role": invite.role.value,
        "token": token,
        "expires_at": invite.expires_at.isoformat(),
    }


@router.get("/api/invites/{token}")
async def preview_invite(token: str, db: AsyncSession = Depends(get_db)):
    invite = (
        await db.execute(select(WorkspaceInvite).where(WorkspaceInvite.token == token))
    ).scalar_one_or_none()
    if not invite or invite.expires_at < datetime.now(UTC):
        raise HTTPException(404, "invite_not_found_or_expired")
    if invite.accepted_at:
        raise HTTPException(410, "invite_already_used")
    ws = await db.get(Workspace, invite.workspace_id)
    return {
        "workspace_name": ws.name if ws else None,
        "email": invite.email,
        "role": invite.role.value,
        "expires_at": invite.expires_at.isoformat(),
    }


@router.post("/api/invites/{token}/accept")
async def accept_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user is None:
        raise HTTPException(401, "authentication_required")
    invite = (
        await db.execute(select(WorkspaceInvite).where(WorkspaceInvite.token == token))
    ).scalar_one_or_none()
    if not invite:
        raise HTTPException(404, "invite_not_found")
    if invite.accepted_at:
        raise HTTPException(410, "invite_already_used")
    if invite.expires_at < datetime.now(UTC):
        raise HTTPException(410, "invite_expired")

    # Already a member? Just mark accepted, no duplicate row
    existing = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == invite.workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not existing:
        db.add(WorkspaceMember(
            workspace_id=invite.workspace_id,
            user_id=user.id,
            role=invite.role,
        ))
    invite.accepted_at = datetime.now(UTC)
    await db.commit()
    return {"workspace_id": str(invite.workspace_id), "role": invite.role.value}
