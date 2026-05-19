"""Health + version endpoints."""
from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from bumblebee.database import get_db
from bumblebee import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "bumblebee-api", "version": __version__}


@router.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT 1"))
    return {"db": "ok" if result.scalar() == 1 else "fail"}
