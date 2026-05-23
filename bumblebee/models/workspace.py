"""Workspace tenancy — Phase A foundation for multi-tenant SaaS.

A workspace is the top-level isolation boundary. Every project, issue, event, session,
api_key, notification, etc. belongs to exactly one workspace. JWTs carry the active
workspace_id; every API request is scoped to it.

Roles:
- owner:  full control + billing + delete workspace. Exactly 1 per workspace.
- admin:  manage members + projects.
- member: CRUD issues, trigger workflows.
- viewer: read-only.
"""
from __future__ import annotations
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPKMixin


class WorkspaceRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class WorkspacePlan(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    TEAM = "team"


class Workspace(Base, UUIDPKMixin, TimestampMixin, SoftDeleteMixin):
    """Top-level tenant boundary. Owner-managed, billable, soft-deletable."""
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    plan: Mapped[WorkspacePlan] = mapped_column(
        SqlEnum(WorkspacePlan, values_callable=lambda x: [e.value for e in x]),
        default=WorkspacePlan.FREE,
        nullable=False,
    )

    # Stripe linkage (filled in Phase D; nullable until then)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), index=True)

    # Billing period + spend tracking (incrementing counter, reset monthly)
    llm_spend_cents_this_period: Mapped[int] = mapped_column(default=0, nullable=False)
    period_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Failed-payment grace mode
    payment_overdue: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payment_overdue_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Free-form settings (timezone, branding, etc.)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    members = relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )
    invites = relationship(
        "WorkspaceInvite", back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(Base, UUIDPKMixin, TimestampMixin):
    """Membership join row binding a user to a workspace with a role."""
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        SqlEnum(WorkspaceRole, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    workspace = relationship("Workspace", back_populates="members")


class WorkspaceInvite(Base, UUIDPKMixin, TimestampMixin):
    """Pending invite — single-use, expires in 7 days."""
    __tablename__ = "workspace_invites"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[WorkspaceRole] = mapped_column(
        SqlEnum(WorkspaceRole, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    workspace = relationship("Workspace", back_populates="invites")
