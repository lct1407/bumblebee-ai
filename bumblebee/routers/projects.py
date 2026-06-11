"""Project CRUD — workspace-scoped, RBAC-protected."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.database import get_db
from bumblebee.models.project import Project
from bumblebee.models.user import User
from bumblebee.models.workspace import WorkspaceMember
from bumblebee.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from bumblebee.services.rbac import (
    CurrentWorkspace,
    Permission,
    require_permission,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_PROJECT)),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(
        select(Project).where(
            Project.workspace_id == ws_ctx.workspace_id,
            Project.deleted_at.is_(None),
        )
    )
    return list(result.scalars().all())


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreate,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.WRITE_PROJECT)),
    db: AsyncSession = Depends(get_db),
) -> Project:
    # Reject duplicate slug or key within the workspace
    existing = (
        await db.execute(
            select(Project).where(
                Project.workspace_id == ws_ctx.workspace_id,
                Project.deleted_at.is_(None),
                (Project.slug == body.slug) | (Project.key == body.key.upper()),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "project_slug_or_key_conflict")

    proj = Project(
        **body.model_dump(exclude={"key"}),
        key=body.key.upper(),
        workspace_id=ws_ctx.workspace_id,
    )
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return proj


@router.get("/{slug}/members")
async def list_project_members(
    slug: str,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_PROJECT)),
    db: AsyncSession = Depends(get_db),
):
    """Assignable users — members of the workspace that owns this project."""
    project = (
        await db.execute(
            select(Project).where(
                Project.slug == slug,
                Project.workspace_id == ws_ctx.workspace_id,
                Project.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "project_not_found")
    rows = (
        await db.execute(
            select(WorkspaceMember, User)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(WorkspaceMember.workspace_id == ws_ctx.workspace_id)
        )
    ).all()
    return [
        {
            "user_id": str(m.user_id),
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "role": m.role.value,
        }
        for m, u in rows
    ]


@router.get("/{slug}", response_model=ProjectOut)
async def get_project(
    slug: str,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_PROJECT)),
    db: AsyncSession = Depends(get_db),
) -> Project:
    stmt = select(Project).where(
        Project.slug == slug,
        Project.workspace_id == ws_ctx.workspace_id,
        Project.deleted_at.is_(None),
    )
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "project_not_found")
    return proj


@router.patch("/{slug}", response_model=ProjectOut)
async def update_project(
    slug: str,
    body: ProjectUpdate,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.WRITE_PROJECT)),
    db: AsyncSession = Depends(get_db),
) -> Project:
    stmt = select(Project).where(
        Project.slug == slug,
        Project.workspace_id == ws_ctx.workspace_id,
        Project.deleted_at.is_(None),
    )
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "project_not_found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(proj, k, v)
    await db.commit()
    await db.refresh(proj)
    return proj


@router.delete("/{slug}", status_code=204)
async def delete_project(
    slug: str,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.DELETE_PROJECT)),
    db: AsyncSession = Depends(get_db),
) -> None:
    stmt = select(Project).where(
        Project.slug == slug,
        Project.workspace_id == ws_ctx.workspace_id,
        Project.deleted_at.is_(None),
    )
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "project_not_found")
    proj.deleted_at = datetime.now(UTC)
    await db.commit()
