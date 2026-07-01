"""GraphQL request context: db session + current user + current workspace."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import BaseContext

from bumblebee.database import SessionLocal
from bumblebee.models.user import User
from bumblebee.models.workspace import Workspace


@dataclass
class GraphQLContext(BaseContext):
    db: AsyncSession
    user: User | None = None
    workspace: Workspace | None = None
    role: str | None = None  # workspace role string


async def get_context(request: Request) -> GraphQLContext:
    """Build per-request context.

    Auth is best-effort here: resolvers that need auth should check ctx.user / ctx.workspace
    and raise PermissionDenied if missing. We do NOT hard-fail at context build time so
    public queries (e.g. `plans`) still work.
    """
    db = SessionLocal()
    user = None
    workspace = None
    role = None

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and not auth[7:].startswith("nt_"):
        try:
            from bumblebee.auth.security import decode_access_token
            from bumblebee.services.rbac.dependencies import resolve_active_workspace
            payload = decode_access_token(auth[7:]) or {}
            user_id = payload.get("sub")
            if user_id:
                user = await db.get(User, user_id)
            if user is not None:
                # Same precedence as REST: X-Workspace header → JWT claim → earliest
                # active. Verifies membership + skips soft-deleted, so role is the
                # user's role in the *resolved* workspace, not the (possibly stale) claim.
                member = await resolve_active_workspace(
                    db,
                    user.id,
                    x_workspace=request.headers.get("X-Workspace"),
                    jwt_ws=payload.get("ws"),
                )
                if member is not None:
                    workspace = await db.get(Workspace, member.workspace_id)
                    role = member.role.value
        except Exception:
            pass

    return GraphQLContext(db=db, user=user, workspace=workspace, role=role)
