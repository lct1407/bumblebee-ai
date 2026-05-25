"""TaskQueue: PostgreSQL SKIP LOCKED atomic claim. Plane 2 / Dispatch."""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.config import get_settings

settings = get_settings()


async def enqueue(
    db: AsyncSession,
    *,
    payload: dict,
    issue_id: uuid.UUID | None = None,
    workflow_run_id: uuid.UUID | None = None,
    required_provider: str | None = None,
    required_project_id: uuid.UUID | None = None,
    priority: int = 2,
    idempotency_key: str | None = None,
    max_attempts: int = 3,
) -> uuid.UUID:
    """Insert a task. Returns task id.

    BB-18: `required_project_id` constrains which devices can claim this task —
    only daemons whose bound_project_ids include this id will see it.
    """
    task_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO task_queue (
                id, status, priority, payload, idempotency_key,
                issue_id, workflow_run_id, required_provider, required_project_id,
                attempts, max_attempts, created_at, updated_at
            ) VALUES (
                :id, 'queued', :priority, CAST(:payload AS JSONB), :key,
                :issue_id, :run_id, :provider, :project_id, 0, :max_attempts,
                NOW(), NOW()
            )
            ON CONFLICT (idempotency_key) DO NOTHING
        """),
        {
            "id": task_id,
            "priority": priority,
            "payload": __import__("json").dumps(payload),
            "key": idempotency_key,
            "issue_id": issue_id,
            "run_id": workflow_run_id,
            "provider": required_provider,
            "project_id": required_project_id,
            "max_attempts": max_attempts,
        },
    )
    return task_id


async def claim_next(
    db: AsyncSession,
    *,
    claimed_by: str,
    required_provider: str | None = None,
    bound_project_ids: list | None = None,
    lease_seconds: int | None = None,
) -> dict | None:
    """Atomic claim via SKIP LOCKED. Returns dict with task details or None.

    BB-18: when `bound_project_ids` is provided, only return tasks whose
    `required_project_id` matches one of them OR is NULL (any-project tasks).
    Empty list means accept any project (generalist worker, legacy behaviour).
    """
    lease_seconds = lease_seconds or settings.lease_ttl_seconds
    expires_at = datetime.now(UTC) + timedelta(seconds=lease_seconds)

    provider_clause = "AND (required_provider IS NULL OR required_provider = :provider)"
    if required_provider is None:
        provider_clause = ""

    project_clause = ""
    proj_params: dict = {}
    if bound_project_ids:
        # Dynamic IN clause — one named bind per UUID to avoid asyncpg array binding pain
        placeholders = []
        for idx, pid in enumerate(bound_project_ids):
            key = f"proj_{idx}"
            placeholders.append(f":{key}")
            proj_params[key] = str(pid)
        project_clause = (
            f"AND (required_project_id IS NULL OR "
            f"required_project_id IN ({', '.join(placeholders)}))"
        )

    sql = f"""
        WITH next_task AS (
            SELECT id FROM task_queue
            WHERE status = 'queued'
              {provider_clause}
              {project_clause}
            ORDER BY priority ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE task_queue
        SET status = 'claimed',
            claimed_by = :claimed_by,
            claimed_at = NOW(),
            lease_expires_at = :expires_at,
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = (SELECT id FROM next_task)
        RETURNING id, payload, issue_id, workflow_run_id, attempts,
                  required_provider, required_project_id
    """

    params = {"claimed_by": claimed_by, "expires_at": expires_at}
    if required_provider:
        params["provider"] = required_provider
    params.update(proj_params)

    result = await db.execute(text(sql), params)
    row = result.fetchone()
    if row is None:
        return None
    return {
        "id": row.id,
        "payload": row.payload,
        "issue_id": row.issue_id,
        "workflow_run_id": row.workflow_run_id,
        "attempts": row.attempts,
        "required_provider": row.required_provider,
        "required_project_id": row.required_project_id,
    }


async def complete(db: AsyncSession, task_id: uuid.UUID) -> None:
    await db.execute(
        text("UPDATE task_queue SET status='completed', updated_at=NOW() WHERE id=:id"),
        {"id": task_id},
    )


async def fail(db: AsyncSession, task_id: uuid.UUID, error: str) -> None:
    """Mark fail; if attempts >= max_attempts, move to dead_letter; else re-queue."""
    await db.execute(
        text("""
            UPDATE task_queue
            SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'queued' END,
                last_error = :err,
                claimed_by = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                updated_at = NOW()
            WHERE id = :id
        """),
        {"id": task_id, "err": error[:2000]},
    )


async def reap_stale(db: AsyncSession) -> int:
    """Reap claimed tasks whose lease expired. Returns count reset."""
    result = await db.execute(
        text("""
            UPDATE task_queue
            SET status = 'queued',
                claimed_by = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                updated_at = NOW()
            WHERE status = 'claimed' AND lease_expires_at < NOW()
            RETURNING id
        """)
    )
    return len(result.fetchall())
