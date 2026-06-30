"""FastAPI dependencies that enforce workspace + role + permission.

Usage:
    @router.get("/api/issues")
    async def list_issues(
        ws: CurrentWorkspace = Depends(require_permission(Permission.READ_ISSUE)),
        db: AsyncSession = Depends(get_db),
    ):
        # ws.workspace_id is guaranteed in-scope; ws.role is guaranteed permitted
        ...

Resolution order (first that resolves to an ACTIVE membership wins):
  1. `X-Workspace` header (slug or id) — the client's last-used selection. Ignored
     (not 403) if it doesn't resolve to an active membership, so a stale stored
     selection degrades gracefully to the default below.
  2. JWT claim `ws` if present → membership for (user, workspace).
  3. Fallback to user's earliest-joined workspace (for legacy/API-key flows).
  4. 403 (never 404) on missing/invalid — never leak workspace existence.

Soft-deleted workspaces are never resolvable through any path.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.dependencies import get_current_user
from bumblebee.auth.security import decode_access_token
from bumblebee.database import get_db
from bumblebee.models.user import User
from bumblebee.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from bumblebee.services.rbac.permissions import Permission, has_permission


@dataclass
class CurrentWorkspace:
    """Resolved current workspace context for an authenticated request."""
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    role: WorkspaceRole


def _extract_workspace_claim(authorization: str | None) -> uuid.UUID | None:
    """Pull the `ws` claim out of a Bearer JWT if present + valid. Else None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = decode_access_token(authorization[7:])
    if not payload:
        return None
    ws = payload.get("ws")
    if not ws:
        return None
    try:
        return uuid.UUID(str(ws))
    except (ValueError, TypeError):
        return None


async def _resolve_active_membership(
    db: AsyncSession, user_id: uuid.UUID, ref: str
) -> WorkspaceMember | None:
    """Resolve a workspace reference (UUID or slug) to the user's membership.

    Returns None unless the workspace exists, is not soft-deleted, and the user is
    a member of it. Used for both the X-Workspace header and the JWT `ws` claim.
    """
    # Match by slug, or by id when the ref parses as a UUID — covers the degenerate
    # case of a workspace whose slug is itself UUID-shaped.
    match = Workspace.slug == ref
    try:
        match = or_(match, WorkspaceMember.workspace_id == uuid.UUID(ref))
    except (ValueError, TypeError):
        pass
    stmt = (
        select(WorkspaceMember)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.user_id == user_id,
            Workspace.deleted_at.is_(None),
            match,
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _earliest_active_membership(
    db: AsyncSession, user_id: uuid.UUID
) -> WorkspaceMember | None:
    """The user's earliest-joined membership among non-deleted workspaces ("first").

    `id` is a secondary sort key so the pick is deterministic when two memberships
    share a created_at timestamp — keeping it identical to the client's data[0].
    """
    return (
        await db.execute(
            select(WorkspaceMember)
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .where(
                WorkspaceMember.user_id == user_id,
                Workspace.deleted_at.is_(None),
            )
            .order_by(WorkspaceMember.created_at.asc(), WorkspaceMember.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def resolve_active_workspace(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    x_workspace: str | None,
    jwt_ws: str | None,
) -> WorkspaceMember | None:
    """Shared active-workspace resolution for REST + GraphQL.

    Precedence: X-Workspace header (last-used selection) → JWT `ws` claim → earliest
    active membership. The header and claim only take effect if they resolve to an
    active (non-deleted) workspace the user is a member of; otherwise resolution falls
    through, so a stale/invalid value degrades to the default instead of erroring.
    Returns None only when the user has no active membership at all.
    """
    if x_workspace and x_workspace.strip():
        member = await _resolve_active_membership(db, user_id, x_workspace.strip())
        if member:
            return member
    if jwt_ws:
        member = await _resolve_active_membership(db, user_id, str(jwt_ws))
        if member:
            return member
    return await _earliest_active_membership(db, user_id)


async def require_workspace(
    authorization: Annotated[str | None, Header()] = None,
    x_workspace: Annotated[str | None, Header()] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> CurrentWorkspace:
    """Resolve the active workspace: X-Workspace header → JWT claim → earliest active."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    claimed_ws = _extract_workspace_claim(authorization)
    member = await resolve_active_workspace(
        db,
        user.id,
        x_workspace=x_workspace,
        jwt_ws=str(claimed_ws) if claimed_ws else None,
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No workspace membership",
        )
    return CurrentWorkspace(
        workspace_id=member.workspace_id, user_id=user.id, role=member.role
    )


def require_permission(permission: Permission) -> Callable:
    """FastAPI dep factory that requires a permission for the current workspace role."""

    async def _check(
        ws: Annotated[CurrentWorkspace, Depends(require_workspace)],
    ) -> CurrentWorkspace:
        if not has_permission(ws.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission.value}' required",
            )
        return ws

    return _check


def require_role(role: WorkspaceRole) -> Callable:
    """FastAPI dep factory that requires a specific role (use sparingly; prefer permissions).

    Owners are implicitly granted all roles' privileges.
    """

    async def _check(
        ws: Annotated[CurrentWorkspace, Depends(require_workspace)],
    ) -> CurrentWorkspace:
        if ws.role != role and ws.role != WorkspaceRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role.value}' required",
            )
        return ws

    return _check
