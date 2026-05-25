"""Replay endpoint — Phase 7."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.services.obs.replay import diff_replay, replay_session

router = APIRouter(prefix="/api/replay", tags=["replay"])


@router.get("/{session_id}")
async def replay(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await replay_session(db, session_id)


@router.get("/{session_a}/diff/{session_b}")
async def diff(session_a: uuid.UUID, session_b: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await diff_replay(db, session_a, session_b)
