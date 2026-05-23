"""Strawberry types mirroring SQLAlchemy models.

Naming: `<ModelName>Type` for outputs, `<ModelName>Input` for mutations.
Enums re-exported as strawberry.enum.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional

import strawberry

from bumblebee.models.issue import (
    IssueStatus, IssueType, IssuePriority, IssueComplexity,
)
from bumblebee.models.workspace import WorkspacePlan, WorkspaceRole
from bumblebee.models.agent_node import NodeStatus
from bumblebee.models.issue_relation import IssueRelationKind


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
    note: Optional[str]
    created_at: datetime


@strawberry.input
class RelationCreateInput:
    source_issue_id: uuid.UUID
    target_issue_id: uuid.UUID
    kind: IssueRelationKindGQL  # type: ignore[valid-type]
    note: Optional[str] = None


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
    description: Optional[str]
    repo_path: Optional[str]
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
    description: Optional[str]
    type: IssueTypeGQL  # type: ignore[valid-type]
    status: IssueStatusGQL  # type: ignore[valid-type]
    priority: IssuePriorityGQL  # type: ignore[valid-type]
    complexity: Optional[IssueComplexityGQL]  # type: ignore[valid-type]
    ai_summary: Optional[str]
    ai_suggested_solution: Optional[str]
    ai_confidence: Optional[float]
    acceptance_criteria: Optional[str]
    scope_hints: list[str]
    parent_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


# Strawberry conflicts with bare name `IssueType` (already an enum). Alias for export.
Issue = IssueType_


@strawberry.type
class EventType:
    id: uuid.UUID
    workspace_id: uuid.UUID
    issue_id: Optional[uuid.UUID]
    project_id: Optional[uuid.UUID]
    session_id: Optional[uuid.UUID]
    type: str
    payload: strawberry.scalars.JSON
    source: Optional[str]
    actor: Optional[str]
    occurred_at: datetime


@strawberry.type
class AgentNodeType:
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    status: NodeStatusGQL  # type: ignore[valid-type]
    capabilities: list[str]
    platform: Optional[str]
    hostname: Optional[str]
    last_heartbeat_at: Optional[datetime]
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
    description: Optional[str] = None
    type: Optional[IssueTypeGQL] = None  # type: ignore[valid-type]
    priority: Optional[IssuePriorityGQL] = None  # type: ignore[valid-type]
    parent_id: Optional[uuid.UUID] = None


@strawberry.input
class IssueUpdateInput:
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[IssueStatusGQL] = None  # type: ignore[valid-type]
    priority: Optional[IssuePriorityGQL] = None  # type: ignore[valid-type]
    complexity: Optional[IssueComplexityGQL] = None  # type: ignore[valid-type]
    acceptance_criteria: Optional[str] = None
    scope_hints: Optional[list[str]] = None


@strawberry.input
class DevicePairRequestInput:
    name: str
    capabilities: list[str]
    hostname: Optional[str] = None
    platform: Optional[str] = None
    workspace_slug: Optional[str] = None


@strawberry.input
class CheckoutSessionInput:
    workspace_id: uuid.UUID
    plan: str  # 'pro' | 'team'
    seats: int = 1
