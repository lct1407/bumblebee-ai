"""AgentNode — a registered worker machine that pulls and executes tasks.

Pairing flow:
  1. User runs `bb device pair` on their machine -> server returns a pairing_code
  2. User confirms in web UI -> server issues a long-lived node_token
  3. Daemon stores token + uses it for /api/tasks/claim

Roles a node can advertise via `capabilities`: ["claude-cli", "codex-cli", "git", "docker"].
Server uses these to filter tasks (required_provider on task_queue).
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin


class NodeStatus(enum.StrEnum):
    PENDING = "pending"      # pairing requested, not yet confirmed
    ACTIVE = "active"        # confirmed + can claim tasks
    REVOKED = "revoked"      # token invalidated


class AgentNode(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "agent_nodes"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    """Human-readable, e.g. 'Thanh's MacBook Pro' or 'CI runner #3'."""

    status: Mapped[NodeStatus] = mapped_column(
        SqlEnum(NodeStatus, name="node_status", values_callable=lambda x: [e.value for e in x]),
        default=NodeStatus.PENDING, nullable=False, index=True,
    )

    pairing_code: Mapped[str | None] = mapped_column(String(16), index=True)
    """Short-lived (10 min) human-readable code (8 alphanum) for the pair flow."""

    token_hash: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    """SHA-256 of node_token (raw token only shown to user once at pairing)."""

    capabilities: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    """e.g. ['claude-cli', 'git', 'docker']."""

    platform: Mapped[str | None] = mapped_column(String(50))      # darwin / linux / win32
    hostname: Mapped[str | None] = mapped_column(String(255))
    ip_last_seen: Mapped[str | None] = mapped_column(String(64))
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # BB-16: project binding — task router filters claim to nodes bound to project.
    # Empty list = node accepts tasks from any project (legacy / generalist worker).
    bound_project_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
