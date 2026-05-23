"""GraphQL request context: db session + current user + current workspace."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import BaseContext

from bumblebee.database import SessionLocal
from bumblebee.models.user import User
from bumblebee.models.workspace import Workspace


@dataclass
class GraphQLContext(BaseContext):
    db: AsyncSession
    user: Optional[User] = None
    workspace: Optional[Workspace] = None
    role: Optional[str] = None  # workspace role string


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
            payload = decode_access_token(auth[7:]) or {}
            user_id = payload.get("sub")
            if user_id:
                user = await db.get(User, user_id)
            ws_id = payload.get("ws")
            if ws_id:
                workspace = await db.get(Workspace, ws_id)
            role = payload.get("role")
        except Exception:
            pass

    return GraphQLContext(db=db, user=user, workspace=workspace, role=role)
