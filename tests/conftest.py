"""Pytest fixtures — single test engine shared by app + direct sessions.

Phase A introduced workspace tenancy with NOT NULL workspace_id on every scoped
table. The seed data the original tests relied on (Issue.number IN (1,2,3) +
a Project) used to be data-migrated. We now bake that seeding into `clean_db`
so tests are reproducible whether or not the initial alembic data-migration ran.
"""
import sys
import asyncio
import uuid

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from bumblebee.main import app
from bumblebee.database import get_db
from bumblebee.config import get_settings

settings = get_settings()


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine):
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(engine):
    """HTTP client sharing the test engine via dependency override."""
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


SEED_USER_EMAIL = "seed@bumblebee.test"
SEED_USER_USERNAME = "seed"
SEED_WORKSPACE_SLUG = "seed-ws"
# Legacy tests hit /api/projects/bb/... so keep slug + key matching old seed.
SEED_PROJECT_SLUG = "bb"
SEED_PROJECT_KEY = "BB"


async def _seed_workflows_and_issues(db: AsyncSession, project_id, workspace_id) -> None:
    """Inline seed of workflows + agent defs + knowledge + SAMPLE_ISSUES.

    Uses our test DB session (NOT the legacy module's SessionLocal which causes
    event-loop conflicts under sequential pytest runs).
    """
    import hashlib
    import json
    import yaml
    from pathlib import Path

    from bumblebee.seeds.seed_default import (
        AGENT_DEFINITIONS, SAMPLE_KNOWLEDGE, SAMPLE_ISSUES, WORKFLOWS_DIR,
    )

    def hash_prompt(t): return hashlib.sha256(t.encode()).hexdigest()
    def hash_graph(g): return hashlib.sha256(json.dumps(g, sort_keys=True).encode()).hexdigest()

    # 1) Agent definitions
    for spec in AGENT_DEFINITIONS:
        existing = (
            await db.execute(
                text(
                    "SELECT id FROM agent_definitions WHERE role = :r AND is_global = true"
                ),
                {"r": spec["role"]},
            )
        ).first()
        if existing:
            continue
        await db.execute(
            text(
                """
                INSERT INTO agent_definitions
                  (id, workspace_id, name, role, description, prompt_template,
                   prompt_hash, default_tools, focus_areas, default_budgets,
                   is_global, created_at, updated_at)
                VALUES (gen_random_uuid(), :ws, :name, :role, :description, :template,
                        :hash, CAST(:tools AS JSONB), CAST(:focus AS JSONB),
                        CAST(:budgets AS JSONB), true, now(), now())
                """
            ),
            {
                "ws": workspace_id,
                "name": spec["name"],
                "role": spec["role"],
                "description": spec["description"],
                "template": spec["prompt_template"],
                "hash": hash_prompt(spec["prompt_template"]),
                "tools": json.dumps(spec["default_tools"]),
                "focus": json.dumps(spec["focus_areas"]),
                "budgets": json.dumps(spec["default_budgets"]),
            },
        )

    # 2) Workflows from YAML files
    for wf_file in WORKFLOWS_DIR.glob("*.yaml"):
        data = yaml.safe_load(wf_file.read_text(encoding="utf-8"))
        name = data["name"]
        existing = (
            await db.execute(text("SELECT id FROM workflows WHERE name = :n"), {"n": name})
        ).first()
        if existing:
            continue
        await db.execute(
            text(
                """
                INSERT INTO workflows
                  (id, workspace_id, name, version, graph, graph_hash, description,
                   is_active, is_default, created_at, updated_at)
                VALUES (gen_random_uuid(), :ws, :name, :version, CAST(:graph AS JSONB),
                        :hash, :desc, true, :is_default, now(), now())
                """
            ),
            {
                "ws": workspace_id, "name": name,
                "version": data.get("version", 1),
                "graph": json.dumps(data),
                "hash": hash_graph(data),
                "desc": data.get("description"),
                "is_default": name == "simple-fix-flow",
            },
        )

    # 3) Knowledge entries
    for k in SAMPLE_KNOWLEDGE:
        existing = (
            await db.execute(
                text(
                    "SELECT id FROM knowledge_entries WHERE title = :t AND project_id = :p"
                ),
                {"t": k["title"], "p": project_id},
            )
        ).first()
        if existing:
            continue
        await db.execute(
            text(
                """
                INSERT INTO knowledge_entries
                  (id, workspace_id, project_id, title, body, category, tags,
                   scope_globs, created_at, updated_at)
                VALUES (gen_random_uuid(), :ws, :p, :title, :body, :cat,
                        CAST(:tags AS JSONB), CAST(:scope AS JSONB), now(), now())
                """
            ),
            {
                "ws": workspace_id, "p": project_id,
                "title": k["title"], "body": k["body"], "cat": k["category"],
                "tags": json.dumps(k["tags"]),
                "scope": json.dumps(k["scope_globs"]),
            },
        )

    # 4) Sample issues — only if none exist for project
    existing_max = (
        await db.execute(
            text("SELECT COALESCE(MAX(number),0) FROM issues WHERE project_id = :p"),
            {"p": project_id},
        )
    ).scalar()
    if existing_max == 0:
        for i, spec in enumerate(SAMPLE_ISSUES, start=1):
            await db.execute(
                text(
                    """
                    INSERT INTO issues
                      (id, workspace_id, project_id, number, title, description, type,
                       status, priority, scope_hints, acceptance_criteria, session_context,
                       created_at, updated_at)
                    VALUES (gen_random_uuid(), :ws, :p, :n, :title, :desc, :type,
                            'new', :prio, CAST(:scope AS JSONB), :acc, '{}'::jsonb,
                            now(), now())
                    """
                ),
                {
                    "ws": workspace_id, "p": project_id, "n": i,
                    "title": spec["title"], "desc": spec["description"],
                    "type": spec["type"].value if hasattr(spec["type"], "value") else spec["type"],
                    "prio": spec["priority"].value if hasattr(spec["priority"], "value") else spec["priority"],
                    "scope": json.dumps(spec["scope_hints"]),
                    "acc": spec["acceptance_criteria"],
                },
            )

    await db.commit()


async def _ensure_seed(db: AsyncSession) -> dict:
    """Idempotently ensure seed user + workspace + project + 3 issues exist.

    Returns a dict with the resolved UUIDs for tests that want to reference them.
    """
    from bumblebee.auth.security import hash_password

    # Seed user
    user_row = (
        await db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": SEED_USER_USERNAME})
    ).first()
    if not user_row:
        user_id = uuid.uuid4()
        await db.execute(
            text(
                """
                INSERT INTO users (id, email, username, password_hash, is_active, is_admin, created_at, updated_at)
                VALUES (:id, :email, :username, :pwhash, true, true, now(), now())
                """
            ),
            {"id": user_id, "email": SEED_USER_EMAIL, "username": SEED_USER_USERNAME,
             "pwhash": hash_password("seedpassword")},
        )
    else:
        user_id = user_row[0]

    # Seed workspace
    ws_row = (
        await db.execute(text("SELECT id FROM workspaces WHERE slug = :s"), {"s": SEED_WORKSPACE_SLUG})
    ).first()
    if not ws_row:
        ws_id = uuid.uuid4()
        await db.execute(
            text(
                """
                INSERT INTO workspaces
                  (id, name, slug, owner_user_id, plan,
                   llm_spend_cents_this_period, payment_overdue, settings,
                   created_at, updated_at)
                VALUES (:id, 'Seed Workspace', :slug, :owner, 'free', 0, false,
                        '{}'::jsonb, now(), now())
                """
            ),
            {"id": ws_id, "slug": SEED_WORKSPACE_SLUG, "owner": user_id},
        )
        await db.execute(
            text(
                """
                INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
                VALUES (gen_random_uuid(), :ws, :user, 'owner', now(), now())
                """
            ),
            {"ws": ws_id, "user": user_id},
        )
    else:
        ws_id = ws_row[0]
        # Reset billing state on existing seed workspace so tests don't leak
        # payment_overdue / spend counters across the suite.
        await db.execute(
            text(
                "UPDATE workspaces SET payment_overdue = false, "
                "payment_overdue_since = NULL, llm_spend_cents_this_period = 0, "
                "plan = 'free' WHERE id = :ws"
            ),
            {"ws": ws_id},
        )

    # Seed project
    proj_row = (
        await db.execute(text("SELECT id FROM projects WHERE slug = :s"), {"s": SEED_PROJECT_SLUG})
    ).first()
    if not proj_row:
        proj_id = uuid.uuid4()
        await db.execute(
            text(
                """
                INSERT INTO projects
                  (id, workspace_id, name, slug, key, base_branch, policy_config,
                   deploy_config, observability_config, enabled, created_at, updated_at)
                VALUES (:id, :ws, 'Seed Project', :slug, :key, 'main',
                        '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, true, now(), now())
                """
            ),
            {"id": proj_id, "ws": ws_id, "slug": SEED_PROJECT_SLUG, "key": SEED_PROJECT_KEY},
        )
    else:
        proj_id = proj_row[0]

    # Issues 1-3 are created by the legacy seed (bumblebee.seeds.seed_default).
    # We only ensure the user/workspace/project shell here.
    await db.commit()
    return {
        "user_id": uuid.UUID(str(user_id)),
        "workspace_id": uuid.UUID(str(ws_id)),
        "project_id": uuid.UUID(str(proj_id)),
    }


@pytest_asyncio.fixture
async def clean_db(db):
    """Reset volatile state then ensure seed data exists.

    1. TRUNCATE volatile tables (events, comments, sessions, runs, etc.)
    2. DELETE issues > seed (numbers > 3)
    3. DELETE non-seed workspaces — cascades to their projects/issues/events.
    4. DELETE non-seed users — safe now because we removed their owned workspaces.
    5. Re-ensure seed (idempotent).
    """
    # 1) volatile tables
    try:
        await db.execute(
            text(
                "TRUNCATE TABLE events, comments, scope_leases, agent_sessions, "
                "workflow_runs, notifications, chat_sessions, task_queue "
                "RESTART IDENTITY CASCADE"
            )
        )
    except Exception:
        await db.rollback()
        await db.execute(
            text(
                "TRUNCATE TABLE events, comments, scope_leases, agent_sessions, "
                "workflow_runs, notifications, chat_sessions "
                "RESTART IDENTITY CASCADE"
            )
        )
    # 2) ALL issues — legacy seed will re-create 1-3 fresh
    await db.execute(text("DELETE FROM issues"))
    # 3) non-seed workspaces — cascade-drops their issues/projects/events
    await db.execute(
        text(
            "DELETE FROM workspaces WHERE slug != :seed_ws"
        ),
        {"seed_ws": SEED_WORKSPACE_SLUG},
    )
    # 4) non-seed users (now safe — no workspaces reference them)
    await db.execute(
        text("DELETE FROM api_keys WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id::text FROM users WHERE username = :u)"),
        {"u": SEED_USER_USERNAME},
    )
    await db.execute(
        text("DELETE FROM users WHERE username != :u"),
        {"u": SEED_USER_USERNAME},
    )
    await db.commit()

    # 5) Re-ensure seed (idempotent) + inline-seed workflows/agents/knowledge/issues
    seed = await _ensure_seed(db)
    await _seed_workflows_and_issues(db, seed["project_id"], seed["workspace_id"])
    yield db


@pytest_asyncio.fixture
async def seed_workspace_id(db) -> uuid.UUID:
    """Return the seed workspace id (Phase A scaffold for tests that need it)."""
    seed = await _ensure_seed(db)
    return seed["workspace_id"]
