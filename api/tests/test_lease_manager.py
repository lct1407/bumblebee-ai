"""Test: ScopeLease — acquire / conflict / release / heartbeat."""
import uuid
import pytest
from sqlalchemy import select

from src.models.scope_lease import ScopeLease, LeaseStatus
from src.models.agent_session import AgentSession
from src.models.issue import Issue
from src.services.dispatch.lease_manager import (
    acquire_lease,
    release_lease,
    heartbeat_lease,
    _globs_overlap,
)


def test_globs_overlap_basic():
    # Same prefix overlaps
    assert _globs_overlap(["src/auth/**"], ["src/auth/login.py"]) is True
    # Different roots don't
    assert _globs_overlap(["api/**"], ["web/**"]) is False
    # Exact match
    assert _globs_overlap(["src/x.py"], ["src/x.py"]) is True


@pytest.mark.asyncio
async def test_acquire_and_release(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    session = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(session)
    await db.flush()

    lease = await acquire_lease(
        db, session_id=session.id, issue_id=issue.id, patterns=["api/src/auth/**"]
    )
    assert lease is not None
    assert lease.status == LeaseStatus.ACTIVE
    assert "api/src/auth/**" in lease.patterns

    await release_lease(db, lease.id)
    assert lease.status == LeaseStatus.RELEASED


@pytest.mark.asyncio
async def test_conflict_blocks_second_acquire(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()

    s1 = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    s2 = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add_all([s1, s2])
    await db.flush()

    l1 = await acquire_lease(
        db, session_id=s1.id, issue_id=issue.id, patterns=["api/src/auth/**"]
    )
    assert l1 is not None

    # Second tries overlapping scope — should fail
    l2 = await acquire_lease(
        db, session_id=s2.id, issue_id=issue.id, patterns=["api/src/auth/login.py"]
    )
    assert l2 is None

    # Disjoint scope succeeds
    l3 = await acquire_lease(
        db, session_id=s2.id, issue_id=issue.id, patterns=["web/src/**"]
    )
    assert l3 is not None


@pytest.mark.asyncio
async def test_heartbeat_extends_lease(clean_db):
    db = clean_db
    issue = (await db.execute(select(Issue).where(Issue.number == 1))).scalar_one()
    session = AgentSession(role="implementer", provider="stub", issue_id=issue.id)
    db.add(session)
    await db.flush()

    lease = await acquire_lease(
        db, session_id=session.id, issue_id=issue.id, patterns=["x/**"]
    )
    original_expires = lease.expires_at
    ok = await heartbeat_lease(db, lease.id)
    assert ok is True
    assert lease.expires_at >= original_expires
