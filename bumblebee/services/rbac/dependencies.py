"""FastAPI dependencies that enforce workspace + role + permission.

Usage:
    @router.get("/api/issues")
    async def list_issues(
        ws: CurrentWorkspace = Depends(require_permission(Permission.READ_ISSUE)),
        db: AsyncSession = Depends(get_db),
    ):
        # ws.workspace_id is guaranteed in-scope; ws.role is guaranteed permitted
        ...

Resolution order:
  1. JWT claim `ws` if present → look up membership for (user, workspace).
  2. Fallback to user's earliest-joined workspace (for legacy/API-key flows).
  3. 403 (never 404) on missing/invalid — never leak workspace existence.
"""
from __future__ import annotations
import uuid
from dataclasses import dataclass
from typing import Annotated, Callable, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
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


def _extract_workspace_claim(authorization: Optional[str]) -> Optional[uuid.UUID]:
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


async def require_workspace(
    authorization: Annotated[Optional[str], Header()] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> CurrentWorkspace:
    """Resolve the active workspace from JWT claim → verify membership → return context.

    Two paths:
    - JWT carries `ws` claim → verify user is still a member of that workspace.
    - No claim (API key path or legacy token) → use earliest-joined workspace as fallback.
    """
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    claimed_ws = _extract_workspace_claim(authorization)

    if claimed_ws is not None:
        # Verify the user is still a member of the claimed workspace
        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == claimed_ws,
                WorkspaceMember.user_id == user.id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            # Membership revoked or invalid claim — never leak whether ws exists
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this workspace",
            )
        return CurrentWorkspace(
            workspace_id=member.workspace_id, user_id=user.id, role=member.role
        )

    # Fallback: earliest-joined workspace
    result = await db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(WorkspaceMember.created_at.asc())
        .limit(1)
    )
    member = result.scalar_one_or_none()
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
