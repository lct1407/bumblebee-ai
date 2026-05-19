"""Pytest fixtures â€” single test engine shared by app + direct sessions."""
import sys
import asyncio

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


@pytest_asyncio.fixture
async def clean_db(db):
    """Reset volatile tables; keep seeded projects/agents/workflows/knowledge."""
    await db.execute(
        text(
            "TRUNCATE TABLE events, comments, scope_leases, agent_sessions, "
            "workflow_runs, notifications, chat_sessions, task_queue RESTART IDENTITY CASCADE"
        )
    )
    await db.execute(text("DELETE FROM issues WHERE number > 3"))
    await db.commit()
    yield db
