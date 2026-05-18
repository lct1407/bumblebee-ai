"""Test: PG SKIP LOCKED queue — enqueue + claim + complete + fail."""
import uuid
import pytest

from src.services.dispatch.task_queue import enqueue, claim_next, complete, fail


@pytest.mark.asyncio
async def test_enqueue_and_claim(clean_db):
    db = clean_db
    task_id = await enqueue(
        db,
        payload={"role": "implementer", "issue": "x"},
        priority=2,
        idempotency_key=f"test-{uuid.uuid4()}",
    )
    await db.commit()
    assert task_id is not None

    claimed = await claim_next(db, claimed_by="worker-1")
    await db.commit()
    assert claimed is not None
    assert claimed["payload"]["role"] == "implementer"


@pytest.mark.asyncio
async def test_claim_returns_none_when_empty(clean_db):
    db = clean_db
    claimed = await claim_next(db, claimed_by="worker-1")
    await db.commit()
    assert claimed is None


@pytest.mark.asyncio
async def test_priority_ordering(clean_db):
    db = clean_db
    low = await enqueue(db, payload={"name": "low"}, priority=3,
                       idempotency_key=f"low-{uuid.uuid4()}")
    high = await enqueue(db, payload={"name": "high"}, priority=0,
                        idempotency_key=f"high-{uuid.uuid4()}")
    await db.commit()

    c1 = await claim_next(db, claimed_by="w1")
    await db.commit()
    assert c1["payload"]["name"] == "high"  # priority 0 first

    c2 = await claim_next(db, claimed_by="w2")
    await db.commit()
    assert c2["payload"]["name"] == "low"


@pytest.mark.asyncio
async def test_fail_retries_then_dead_letter(clean_db):
    db = clean_db
    task_id = await enqueue(
        db, payload={"x": 1}, max_attempts=2,
        idempotency_key=f"retry-{uuid.uuid4()}",
    )
    await db.commit()

    # First claim → fail (attempts=1, re-queued)
    c1 = await claim_next(db, claimed_by="w1")
    await db.commit()
    await fail(db, c1["id"], "transient")
    await db.commit()

    # Second claim → fail (attempts=2 = max, → dead_letter)
    c2 = await claim_next(db, claimed_by="w1")
    await db.commit()
    await fail(db, c2["id"], "permanent")
    await db.commit()

    # Now no more claims available (status=dead_letter)
    c3 = await claim_next(db, claimed_by="w1")
    await db.commit()
    assert c3 is None


@pytest.mark.asyncio
async def test_idempotency_key_dedup(clean_db):
    db = clean_db
    key = f"idem-{uuid.uuid4()}"
    await enqueue(db, payload={"a": 1}, idempotency_key=key)
    await db.commit()
    # Second enqueue with same key is no-op due to ON CONFLICT
    await enqueue(db, payload={"a": 2}, idempotency_key=key)
    await db.commit()

    c1 = await claim_next(db, claimed_by="w")
    await db.commit()
    c2 = await claim_next(db, claimed_by="w")
    await db.commit()
    assert c1["payload"]["a"] == 1  # original kept
    assert c2 is None  # only one row
