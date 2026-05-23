"""GraphQL Query root."""
from __future__ import annotations
import uuid
from typing import Optional

import strawberry
from sqlalchemy import select

from bumblebee.graphql.context import GraphQLContext
from bumblebee.graphql.types import (
    AgentNodeType, EventType, Issue, ProjectType, WorkspaceType,
)
from bumblebee.models.agent_node import AgentNode
from bumblebee.models.event import Event
from bumblebee.models.issue import Issue as IssueModel
from bumblebee.models.project import Project as ProjectModel
from bumblebee.models.workspace import Workspace as WorkspaceModel


def _require_workspace(info) -> uuid.UUID:
    ctx: GraphQLContext = info.context
    if not ctx.workspace:
        raise PermissionError("workspace_required")
    return ctx.workspace.id


def _require_permission(info, permission) -> uuid.UUID:
    """BB-7: enforce role-based permission on a resolver. Returns workspace_id."""
    from bumblebee.services.rbac.permissions import has_permission
    from bumblebee.models.workspace import WorkspaceRole
    ctx: GraphQLContext = info.context
    if not ctx.workspace or not ctx.role:
        raise PermissionError("workspace_required")
    try:
        role_enum = WorkspaceRole(ctx.role)
    except ValueError:
        raise PermissionError("invalid_role")
    if not has_permission(role_enum, permission):
        raise PermissionError(f"missing_permission:{permission.value}")
    return ctx.workspace.id


def _to_workspace(w: WorkspaceModel) -> WorkspaceType:
    return WorkspaceType(
        id=w.id, name=w.name, slug=w.slug, plan=w.plan,
        payment_overdue=w.payment_overdue, created_at=w.created_at,
    )


def _to_project(p: ProjectModel) -> ProjectType:
    return ProjectType(
        id=p.id, workspace_id=p.workspace_id, name=p.name, slug=p.slug,
        key=p.key, description=p.description, repo_path=p.repo_path,
        base_branch=p.base_branch,
        staging_branch=(p.policy_config or {}).get("staging_branch", "stg"),
        enabled=p.enabled, created_at=p.created_at,
    )


def _to_issue(i: IssueModel) -> Issue:
    return Issue(
        id=i.id, project_id=i.project_id, number=i.number, title=i.title,
        description=i.description, type=i.type, status=i.status,
        priority=i.priority, complexity=i.complexity,
        ai_summary=i.ai_summary, ai_suggested_solution=i.ai_suggested_solution,
        ai_confidence=i.ai_confidence, acceptance_criteria=i.acceptance_criteria,
        scope_hints=i.scope_hints or [], parent_id=i.parent_id,
        created_at=i.created_at, updated_at=i.updated_at,
    )


def _to_event(e: Event) -> EventType:
    return EventType(
        id=e.id, workspace_id=e.workspace_id, issue_id=e.issue_id,
        project_id=e.project_id, session_id=e.session_id, type=e.type,
        payload=e.payload or {}, source=e.source, actor=e.actor,
        occurred_at=e.occurred_at,
    )


def _to_node(n: AgentNode) -> AgentNodeType:
    return AgentNodeType(
        id=n.id, workspace_id=n.workspace_id, name=n.name, status=n.status,
        capabilities=n.capabilities or [], platform=n.platform,
        hostname=n.hostname, last_heartbeat_at=n.last_heartbeat_at,
        created_at=n.created_at,
    )


@strawberry.type
class Query:
    @strawberry.field
    async def me(self, info: strawberry.Info) -> Optional[WorkspaceType]:
        ctx: GraphQLContext = info.context
        if not ctx.workspace:
            return None
        return _to_workspace(ctx.workspace)

    @strawberry.field
    async def workspace(self, info: strawberry.Info, id: uuid.UUID) -> Optional[WorkspaceType]:
        ctx: GraphQLContext = info.context
        ws = await ctx.db.get(WorkspaceModel, id)
        if not ws or ws.deleted_at:
            return None
        return _to_workspace(ws)

    @strawberry.field
    async def projects(self, info: strawberry.Info) -> list[ProjectType]:
        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        rows = (
            await ctx.db.execute(
                select(ProjectModel).where(
                    ProjectModel.workspace_id == ws_id,
                    ProjectModel.deleted_at.is_(None),
                ).order_by(ProjectModel.created_at.desc())
            )
        ).scalars().all()
        return [_to_project(p) for p in rows]

    @strawberry.field
    async def project(self, info: strawberry.Info, id: uuid.UUID) -> Optional[ProjectType]:
        ctx: GraphQLContext = info.context
        p = await ctx.db.get(ProjectModel, id)
        if not p or p.deleted_at:
            return None
        return _to_project(p)

    @strawberry.field
    async def issues(
        self,
        info: strawberry.Info,
        project_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> list[Issue]:
        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        stmt = (
            select(IssueModel)
            .where(IssueModel.workspace_id == ws_id, IssueModel.deleted_at.is_(None))
            .order_by(IssueModel.created_at.desc())
            .limit(limit)
        )
        if project_id:
            stmt = stmt.where(IssueModel.project_id == project_id)
        if status:
            stmt = stmt.where(IssueModel.status == status)
        rows = (await ctx.db.execute(stmt)).scalars().all()
        return [_to_issue(i) for i in rows]

    @strawberry.field
    async def issue(self, info: strawberry.Info, id: uuid.UUID) -> Optional[Issue]:
        ctx: GraphQLContext = info.context
        i = await ctx.db.get(IssueModel, id)
        if not i or i.deleted_at:
            return None
        return _to_issue(i)

    @strawberry.field
    async def events(
        self,
        info: strawberry.Info,
        issue_id: Optional[uuid.UUID] = None,
        limit: int = 100,
    ) -> list[EventType]:
        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        stmt = (
            select(Event)
            .where(Event.workspace_id == ws_id)
            .order_by(Event.occurred_at.desc())
            .limit(limit)
        )
        if issue_id:
            stmt = stmt.where(Event.issue_id == issue_id)
        rows = (await ctx.db.execute(stmt)).scalars().all()
        return [_to_event(e) for e in rows]

    @strawberry.field
    async def nodes(self, info: strawberry.Info) -> list[AgentNodeType]:
        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        rows = (
            await ctx.db.execute(
                select(AgentNode)
                .where(AgentNode.workspace_id == ws_id)
                .order_by(AgentNode.created_at.desc())
            )
        ).scalars().all()
        return [_to_node(n) for n in rows]
