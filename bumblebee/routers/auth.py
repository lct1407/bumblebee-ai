"""Auth endpoints — register / login / api-keys.

Phase A: signup creates a workspace + owner membership. JWT carries `ws` + `role`
claims so every API request has implicit tenant scope.
"""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.dependencies import get_current_user
from bumblebee.auth.security import (
    create_access_token,
    generate_api_key,
    hash_password,
    verify_password,
)
from bumblebee.database import get_db
from bumblebee.models.user import ApiKey, User
from bumblebee.models.workspace import Workspace, WorkspaceMember, WorkspaceRole

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: str | None = None
    workspace_name: str | None = None  # optional; defaults to "{username}'s workspace"


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    workspace: dict | None = None


class CreateApiKeyRequest(BaseModel):
    name: str


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key: str | None = None  # only on creation
    created_at: str


def _slugify(s: str) -> str:
    """Lowercase, alphanumerics + hyphens only, no leading/trailing hyphen."""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.strip().lower())
    return s.strip("-")[:50] or "workspace"


async def _unique_slug(db: AsyncSession, base: str) -> str:
    """Find a free slug, appending -2, -3, … on collision."""
    slug = base
    i = 2
    while True:
        existing = (
            await db.execute(select(Workspace).where(Workspace.slug == slug))
        ).scalar_one_or_none()
        if not existing:
            return slug
        slug = f"{base}-{i}"
        i += 1


async def _resolve_primary_membership(
    db: AsyncSession, user_id: uuid.UUID
) -> WorkspaceMember | None:
    """Return the user's earliest-joined workspace membership."""
    return (
        await db.execute(
            select(WorkspaceMember)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(WorkspaceMember.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


def _build_token_payload(user: User, member: WorkspaceMember | None) -> dict:
    """Build the `extra` JWT claims dict."""
    extra = {"username": user.username}
    if member:
        extra["ws"] = str(member.workspace_id)
        extra["role"] = member.role.value
    return extra


def _serialize_workspace(ws: Workspace, role: WorkspaceRole) -> dict:
    return {
        "id": str(ws.id),
        "name": ws.name,
        "slug": ws.slug,
        "plan": ws.plan.value,
        "role": role.value,
    }


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user + auto-create their first workspace (they become owner)."""
    existing = (
        await db.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "username_taken")

    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.flush()  # need user.id for FK

    # Auto-create the first workspace + owner membership
    ws_name = body.workspace_name or f"{body.username}'s workspace"
    ws_slug = await _unique_slug(db, _slugify(ws_name))
    workspace = Workspace(
        name=ws_name,
        slug=ws_slug,
        owner_user_id=user.id,
    )
    db.add(workspace)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WorkspaceRole.OWNER,
    )
    db.add(member)
    await db.commit()
    await db.refresh(user)
    await db.refresh(workspace)
    await db.refresh(member)

    token = create_access_token(str(user.id), extra=_build_token_payload(user, member))
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
        },
        workspace=_serialize_workspace(workspace, member.role),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    # The identifier field accepts either username or email.
    user = (
        await db.execute(
            select(User).where(
                or_(User.username == body.username, User.email == body.username),
                User.is_active,
            )
        )
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "invalid_credentials")

    member = await _resolve_primary_membership(db, user.id)
    workspace_payload = None
    if member:
        ws = await db.get(Workspace, member.workspace_id)
        if ws:
            workspace_payload = _serialize_workspace(ws, member.role)

    token = create_access_token(str(user.id), extra=_build_token_payload(user, member))
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
        },
        workspace=workspace_payload,
    )


@router.get("/me")
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user is None:
        return {"authenticated": False, "auth_enabled": False}
    # Surface the user's workspaces so the UI knows which to switch to
    memberships = (
        await db.execute(
            select(WorkspaceMember).where(WorkspaceMember.user_id == user.id)
        )
    ).scalars().all()
    workspaces = []
    for m in memberships:
        ws = await db.get(Workspace, m.workspace_id)
        if ws and not ws.deleted_at:
            workspaces.append(_serialize_workspace(ws, m.role))

    return {
        "authenticated": True,
        "id": str(user.id) if user.id else None,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
        "workspaces": workspaces,
    }


@router.post("/api-keys", response_model=ApiKeyResponse, status_code=201)
async def create_api_key(
    body: CreateApiKeyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw, h = generate_api_key()
    key = ApiKey(
        key_hash=h,
        name=body.name,
        user_id=str(user.id) if user and user.id else None,
        scopes=[],
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return ApiKeyResponse(
        id=str(key.id),
        name=key.name,
        key=raw,
        created_at=key.created_at.isoformat(),
    )


@router.get("/api-keys")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(ApiKey)
    if user and user.id:
        stmt = stmt.where(ApiKey.user_id == str(user.id))
    keys = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(k.id),
            "name": k.name,
            "is_active": k.is_active,
            "created_at": k.created_at.isoformat(),
        }
        for k in keys
    ]
