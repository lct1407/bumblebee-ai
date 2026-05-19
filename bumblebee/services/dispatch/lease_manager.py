"""LeaseManager — Phase 3 v2: file-set intersection + prefix overlap fallback + events."""
from __future__ import annotations
import fnmatch
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.config import get_settings
from bumblebee.models.scope_lease import LeaseStatus, ScopeLease

settings = get_settings()


def _expand_glob(patterns: list[str], cwd: str | None) -> set[str]:
    files: set[str] = set()
    if cwd and Path(cwd).exists():
        base = Path(cwd)
        for p in patterns:
            try:
                for match in base.glob(p):
                    if match.is_file():
                        files.add(str(match.relative_to(base)))
            except Exception:
                continue
    for p in patterns:
        files.add(p)
    return files


def _globs_overlap(a_patterns: list[str], b_patterns: list[str]) -> bool:
    """Backward-compatible heuristic + improved glob/literal matching."""
    a_set = set(a_patterns)
    b_set = set(b_patterns)
    if a_set & b_set:
        return True
    for a in a_patterns:
        for b in b_patterns:
            a_pref = a.split("*", 1)[0].rstrip("/")
            b_pref = b.split("*", 1)[0].rstrip("/")
            if a_pref and b_pref:
                if a_pref.startswith(b_pref) or b_pref.startswith(a_pref):
                    return True
            if "*" not in b and fnmatch.fnmatch(b, a):
                return True
            if "*" not in a and fnmatch.fnmatch(a, b):
                return True
    return False


async def acquire_lease(
    db: AsyncSession,
    *,
    session_id: uuid.UUID,
    issue_id: uuid.UUID,
    patterns: list[str],
    ttl_seconds: int | None = None,
    cwd: str | None = None,
) -> ScopeLease | None:
    ttl_seconds = ttl_seconds or settings.lease_ttl_seconds
    stmt = select(ScopeLease).where(ScopeLease.status == LeaseStatus.ACTIVE)
    existing = (await db.execute(stmt)).scalars().all()
    resolved = list(_expand_glob(patterns, cwd))
    for lease in existing:
        if _globs_overlap(patterns, lease.patterns):
            return None
        if lease.resolved_files:
            if set(resolved) & set(lease.resolved_files):
                return None

    now = datetime.now(timezone.utc)
    lease = ScopeLease(
        session_id=session_id,
        issue_id=issue_id,
        patterns=patterns,
        resolved_files=resolved,
        status=LeaseStatus.ACTIVE,
        acquired_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds),
        last_heartbeat_at=now,
    )
    db.add(lease)
    await db.flush()

    from bumblebee.services.state.event_log import append_event
    await append_event(
        db, type="lease_acquired", session_id=session_id, issue_id=issue_id,
        payload={"lease_id": str(lease.id), "patterns": patterns},
        source="system",
    )
    return lease


async def release_lease(db: AsyncSession, lease_id: uuid.UUID) -> None:
    lease = await db.get(ScopeLease, lease_id)
    if lease and lease.status == LeaseStatus.ACTIVE:
        lease.status = LeaseStatus.RELEASED
        lease.released_at = datetime.now(timezone.utc)
        from bumblebee.services.state.event_log import append_event
        await append_event(
            db, type="lease_released", session_id=lease.session_id, issue_id=lease.issue_id,
            payload={"lease_id": str(lease.id)},
            source="system",
        )


async def heartbeat_lease(db: AsyncSession, lease_id: uuid.UUID) -> bool:
    lease = await db.get(ScopeLease, lease_id)
    if lease is None or lease.status != LeaseStatus.ACTIVE:
        return False
    now = datetime.now(timezone.utc)
    lease.last_heartbeat_at = now
    lease.expires_at = now + timedelta(seconds=settings.lease_ttl_seconds)
    return True


async def reap_expired(db: AsyncSession) -> int:
    stmt = select(ScopeLease).where(
        ScopeLease.status == LeaseStatus.ACTIVE,
        ScopeLease.expires_at < datetime.now(timezone.utc),
    )
    leases = (await db.execute(stmt)).scalars().all()
    for lease in leases:
        lease.status = LeaseStatus.EXPIRED
    return len(leases)
