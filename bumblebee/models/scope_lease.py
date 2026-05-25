"""ScopeLease: atomic claim on file globs for a session. Exclusive within glob overlap."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import Enum as SqlEnum


def _evcall(x):
    return [e.value for e in x]
import enum

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bumblebee.models.base import Base, TimestampMixin, UUIDPKMixin, WorkspaceScopedMixin


class LeaseStatus(enum.StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    RELEASED = "released"
    REVOKED = "revoked"


class ScopeLease(Base, UUIDPKMixin, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "scope_leases"

    status: Mapped[LeaseStatus] = mapped_column(
        SqlEnum(LeaseStatus, name="lease_status", values_callable=_evcall),
        default=LeaseStatus.ACTIVE, index=True,
    )
    patterns: Mapped[list] = mapped_column(JSONB, nullable=False)  # ["src/auth/**", ...]
    resolved_files: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # ^ pre-resolved file set at acquire time (for overlap detection)

    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )

    session = relationship("AgentSession", back_populates="scope_lease")
    issue = relationship("Issue", back_populates="scope_leases")
