"""Strawberry types mirroring SQLAlchemy models.

Naming: `<ModelName>Type` for outputs, `<ModelName>Input` for mutations.
Enums re-exported as strawberry.enum.
"""
from __future__ import annotations

import uuid
from datetime import datetime

import strawberry

from bumblebee.models.agent_node import NodeStatus
from bumblebee.models.issue import (
    IssueComplexity,
    IssuePriority,
    IssueStatus,
    IssueType,
)
from bumblebee.models.issue_relation import IssueRelationKind
from bumblebee.models.workspace import WorkspacePlan, WorkspaceRole

# ---- Enums --------------------------------------------------------------

IssueStatusGQL = strawberry.enum(IssueStatus, name="IssueStatus")
IssueTypeGQL = strawberry.enum(IssueType, name="IssueType")
IssuePriorityGQL = strawberry.enum(IssuePriority, name="IssuePriority")
IssueComplexityGQL = strawberry.enum(IssueComplexity, name="IssueComplexity")
WorkspacePlanGQL = strawberry.enum(WorkspacePlan, name="WorkspacePlan")
WorkspaceRoleGQL = strawberry.enum(WorkspaceRole, name="WorkspaceRole")
NodeStatusGQL = strawberry.enum(NodeStatus, name="NodeStatus")
IssueRelationKindGQL = strawberry.enum(IssueRelationKind, name="IssueRelationKind")


@strawberry.type
class IssueRelationType:
    id: uuid.UUID
    source_issue_id: uuid.UUID
    target_issue_id: uuid.UUID
    kind: IssueRelationKindGQL  # type: ignore[valid-type]
    note: str | None
    created_at: datetime


@strawberry.input
class RelationCreateInput:
    source_issue_id: uuid.UUID
    target_issue_id: uuid.UUID
    kind: IssueRelationKindGQL  # type: ignore[valid-type]
    note: str | None = None


@strawberry.input
class CustomFieldsUpdateInput:
    issue_id: uuid.UUID
    custom_fields: strawberry.scalars.JSON


# ---- Output types -------------------------------------------------------


@strawberry.type
class WorkspaceType:
    id: uuid.UUID
    name: str
    slug: str
    plan: WorkspacePlanGQL  # type: ignore[valid-type]
    payment_overdue: bool
    created_at: datetime


@strawberry.type
class ProjectType:
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    slug: str
    key: str
    description: str | None
    repo_path: str | None
    base_branch: str
    staging_branch: str
    enabled: bool
    created_at: datetime


@strawberry.type
class IssueType_:
    id: uuid.UUID
    project_id: uuid.UUID
    number: int
    title: str
    description: str | None
    type: IssueTypeGQL  # type: ignore[valid-type]
    status: IssueStatusGQL  # type: ignore[valid-type]
    priority: IssuePriorityGQL  # type: ignore[valid-type]
    complexity: IssueComplexityGQL | None  # type: ignore[valid-type]
    ai_summary: str | None
    ai_suggested_solution: str | None
    ai_confidence: float | None
    acceptance_criteria: str | None
    scope_hints: list[str]
    parent_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# Strawberry conflicts with bare name `IssueType` (already an enum). Alias for export.
Issue = IssueType_


@strawberry.type
class EventType:
    id: uuid.UUID
    workspace_id: uuid.UUID
    issue_id: uuid.UUID | None
    project_id: uuid.UUID | None
    session_id: uuid.UUID | None
    type: str
    payload: strawberry.scalars.JSON
    source: str | None
    actor: str | None
    occurred_at: datetime


@strawberry.type
class AgentNodeType:
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    status: NodeStatusGQL  # type: ignore[valid-type]
    capabilities: list[str]
    platform: str | None
    hostname: str | None
    last_heartbeat_at: datetime | None
    created_at: datetime


@strawberry.type
class PairRequestResult:
    node_id: uuid.UUID
    pairing_code: str
    expires_at: datetime


@strawberry.type
class PairConfirmResult:
    node_id: uuid.UUID
    name: str
    node_token: str  # raw token, shown once


@strawberry.type
class CheckoutSessionResult:
    session_id: str
    url: str


# ---- Input types --------------------------------------------------------


@strawberry.input
class IssueCreateInput:
    project_id: uuid.UUID
    title: str
    description: str | None = None
    type: IssueTypeGQL | None = None  # type: ignore[valid-type]
    priority: IssuePriorityGQL | None = None  # type: ignore[valid-type]
    parent_id: uuid.UUID | None = None


@strawberry.input
class IssueUpdateInput:
    title: str | None = None
    description: str | None = None
    status: IssueStatusGQL | None = None  # type: ignore[valid-type]
    priority: IssuePriorityGQL | None = None  # type: ignore[valid-type]
    complexity: IssueComplexityGQL | None = None  # type: ignore[valid-type]
    acceptance_criteria: str | None = None
    scope_hints: list[str] | None = None


@strawberry.input
class DevicePairRequestInput:
    name: str
    capabilities: list[str]
    hostname: str | None = None
    platform: str | None = None
    workspace_slug: str | None = None


@strawberry.input
class CheckoutSessionInput:
    workspace_id: uuid.UUID
    plan: str  # 'pro' | 'team'
    seats: int = 1
