"""LeaseManager: ScopeLease atomic acquire with glob overlap detection."""
import uuid
import fnmatch
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.scope_lease import ScopeLease, LeaseStatus
from src.config import get_settings

settings = get_settings()


def _globs_overlap(a_patterns: list[str], b_patterns: list[str]) -> bool:
    """Heuristic: two patterns overlap if their literal prefixes overlap."""
    for a in a_patterns:
        for b in b_patterns:
            a_pref = a.split("*", 1)[0].rstrip("/")
            b_pref = b.split("*", 1)[0].rstrip("/")
            if a_pref.startswith(b_pref) or b_pref.startswith(a_pref):
                # Try exact pattern match against representative files
                if fnmatch.fnmatch(b_pref, a) or fnmatch.fnmatch(a_pref, b):
                    return True
                # Conservative: prefix overlap → flag
                if a_pref and b_pref:
                    return True
    return False


async def acquire_lease(
    db: AsyncSession,
    *,
    session_id: uuid.UUID,
    issue_id: uuid.UUID,
    patterns: list[str],
    ttl_seconds: int | None = None,
) -> ScopeLease | None:
    """Try to acquire. Returns the lease if granted, None if conflict."""
    ttl_seconds = ttl_seconds or settings.lease_ttl_seconds

    # Check active leases for overlap
    stmt = select(ScopeLease).where(ScopeLease.status == LeaseStatus.ACTIVE)
    existing = (await db.execute(stmt)).scalars().all()
    for lease in existing:
        if _globs_overlap(patterns, lease.patterns):
            return None  # conflict

    now = datetime.now(timezone.utc)
    lease = ScopeLease(
        session_id=session_id,
        issue_id=issue_id,
        patterns=patterns,
        resolved_files=[],
        status=LeaseStatus.ACTIVE,
        acquired_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds),
        last_heartbeat_at=now,
    )
    db.add(lease)
    await db.flush()
    return lease


async def release_lease(db: AsyncSession, lease_id: uuid.UUID) -> None:
    lease = await db.get(ScopeLease, lease_id)
    if lease and lease.status == LeaseStatus.ACTIVE:
        lease.status = LeaseStatus.RELEASED
        lease.released_at = datetime.now(timezone.utc)


async def heartbeat_lease(db: AsyncSession, lease_id: uuid.UUID) -> bool:
    """Refresh expires_at. Returns True if still active."""
    lease = await db.get(ScopeLease, lease_id)
    if lease is None or lease.status != LeaseStatus.ACTIVE:
        return False
    now = datetime.now(timezone.utc)
    lease.last_heartbeat_at = now
    lease.expires_at = now + timedelta(seconds=settings.lease_ttl_seconds)
    return True


async def reap_expired(db: AsyncSession) -> int:
    """Mark leases expired if past expires_at. Returns count."""
    stmt = select(ScopeLease).where(
        ScopeLease.status == LeaseStatus.ACTIVE,
        ScopeLease.expires_at < datetime.now(timezone.utc),
    )
    leases = (await db.execute(stmt)).scalars().all()
    for lease in leases:
        lease.status = LeaseStatus.EXPIRED
    return len(leases)
