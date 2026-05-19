"""Plugin management endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.plugin_registration import PluginRegistration
from bumblebee.services.plugins.loader import get_loader

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("")
async def list_plugins(db: AsyncSession = Depends(get_db)):
    regs = (
        await db.execute(select(PluginRegistration).order_by(PluginRegistration.name))
    ).scalars().all()
    return [
        {
            "name": r.name,
            "version": r.version,
            "module": r.module,
            "status": r.status,
            "loaded_at": r.loaded_at,
            "error": r.error_message,
        }
        for r in regs
    ]


@router.post("/reload")
async def reload_plugins(db: AsyncSession = Depends(get_db)):
    loader = get_loader()
    results = await loader.discover_and_register(db)
    return {
        "loaded": [r.name for r in results if r.status == "loaded"],
        "failed": [{"name": r.name, "error": r.error} for r in results if r.status == "failed"],
        "summary": {
            "workflows": sum(r.workflows_registered for r in results),
            "agent_defs": sum(r.agent_defs_registered for r in results),
            "skills": sum(r.skills_registered for r in results),
        },
    }
