"""Resolve a Bumblebee API key → (workspace_id, user_id, role).

The MCP server doesn't use JWT — tools are invoked via a single API key per Claude
Code/Desktop session. Each key has been issued in the Bumblebee UI by a workspace
member and is scoped to their role within that workspace.

Phase A note: API keys currently lack a `workspace_id` column (they're user-scoped).
We resolve workspace via the key's owning user's earliest-joined workspace, which
matches the JWT fallback behaviour in `services.rbac.dependencies.require_workspace`.
Phase B-future: add `api_keys.workspace_id` column + scope picker on key creation.
"""
from __future__ import annotations
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.auth.security import hash_api_key
from bumblebee.models.user import ApiKey, User
from bumblebee.models.workspace import WorkspaceMember, WorkspaceRole


@dataclass
class McpAuthContext:
    """Resolved auth + scope for an MCP tool invocation."""
    api_key_id: uuid.UUID
    user_id: uuid.UUID | None
    workspace_id: uuid.UUID
    role: WorkspaceRole


class McpAuthError(Exception):
    """Raised on missing/invalid/unscoped API key. MCP layer maps to JSON-RPC error."""


async def resolve_api_key(db: AsyncSession, raw_key: str) -> McpAuthContext:
    """Hash + lookup the API key, then pick the owner's primary workspace."""
    if not raw_key:
        raise McpAuthError("missing api key")
    key = (
        await db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == hash_api_key(raw_key),
                ApiKey.is_active == True,
            )
        )
    ).scalar_one_or_none()
    if not key:
        raise McpAuthError("invalid api key")

    # System-scoped key (no user) — not yet supported in v1
    if not key.user_id:
        raise McpAuthError("system-scoped api keys not supported via MCP yet")

    user_id = uuid.UUID(str(key.user_id))
    member = (
        await db.execute(
            select(WorkspaceMember)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(WorkspaceMember.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not member:
        raise McpAuthError("api key user has no workspace")

    return McpAuthContext(
        api_key_id=key.id,
        user_id=user_id,
        workspace_id=member.workspace_id,
        role=member.role,
    )
