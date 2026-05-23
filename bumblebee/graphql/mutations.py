"""GraphQL Mutation root.

Coverage:
  - Issue CRUD: createIssue, updateIssue, transitionIssueStatus
  - Devices: pairRequest (unauthenticated), pairConfirm (admin)
  - Billing: createCheckoutSession, cancelSubscription

Notes:
  - Webhook handlers stay in REST routers (Stripe / GitHub cannot POST GraphQL).
  - MCP server keeps its own JSON-RPC surface per spec.
"""
from __future__ import annotations
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

import strawberry
from sqlalchemy import func, select

from bumblebee.graphql.auth_mutations import (
    AuthResult, LoginInput, SignupInput, AuthMutations,
)
from bumblebee.graphql.context import GraphQLContext
from bumblebee.graphql.types import (
    CheckoutSessionInput, CheckoutSessionResult, DevicePairRequestInput,
    Issue, IssueCreateInput, IssueUpdateInput, PairConfirmResult,
    PairRequestResult,
)
from bumblebee.graphql.queries import _require_workspace, _to_issue
from bumblebee.models.agent_node import AgentNode, NodeStatus
from bumblebee.models.issue import Issue as IssueModel, IssueStatus
from bumblebee.models.workspace import Workspace


def _gen_pairing_code() -> str:
    return "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))


def _gen_node_token() -> str:
    return "nt_" + secrets.token_urlsafe(32)


@strawberry.type
class Mutation(AuthMutations):
    # AuthMutations contributes: signup, login, createApiKey

    # ---- Issues ---------------------------------------------------------

    @strawberry.mutation
    async def create_issue(self, info: strawberry.Info, input: IssueCreateInput) -> Issue:
        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        # next number per project
        n = (
            await ctx.db.execute(
                select(func.coalesce(func.max(IssueModel.number), 0) + 1).where(
                    IssueModel.project_id == input.project_id
                )
            )
        ).scalar_one()
        issue = IssueModel(
            project_id=input.project_id,
            workspace_id=ws_id,
            number=n,
            title=input.title,
            description=input.description,
            type=input.type or "task",
            priority=input.priority or "none",
            parent_id=input.parent_id,
        )
        ctx.db.add(issue)
        await ctx.db.commit()
        await ctx.db.refresh(issue)
        return _to_issue(issue)

    @strawberry.mutation
    async def update_issue(self, info: strawberry.Info, id: uuid.UUID, input: IssueUpdateInput) -> Issue:
        ctx: GraphQLContext = info.context
        _require_workspace(info)
        issue = await ctx.db.get(IssueModel, id)
        if not issue:
            raise ValueError("issue_not_found")
        if input.title is not None: issue.title = input.title
        if input.description is not None: issue.description = input.description
        if input.status is not None: issue.status = input.status
        if input.priority is not None: issue.priority = input.priority
        if input.complexity is not None: issue.complexity = input.complexity
        if input.acceptance_criteria is not None: issue.acceptance_criteria = input.acceptance_criteria
        if input.scope_hints is not None: issue.scope_hints = input.scope_hints
        await ctx.db.commit()
        await ctx.db.refresh(issue)
        return _to_issue(issue)

    @strawberry.mutation
    async def approve_issue(self, info: strawberry.Info, id: uuid.UUID) -> Issue:
        """Transition issue from TRIAGED/PLANNED to APPROVED. Phase H2 gate consumer."""
        ctx: GraphQLContext = info.context
        _require_workspace(info)
        issue = await ctx.db.get(IssueModel, id)
        if not issue:
            raise ValueError("issue_not_found")
        if issue.status not in (IssueStatus.TRIAGED, IssueStatus.PLANNED, IssueStatus.NEW):
            raise ValueError(f"cannot_approve_from_{issue.status.value}")
        issue.status = IssueStatus.APPROVED
        await ctx.db.commit()
        await ctx.db.refresh(issue)
        return _to_issue(issue)

    # ---- Devices --------------------------------------------------------

    @strawberry.mutation
    async def device_pair_request(self, info: strawberry.Info, input: DevicePairRequestInput) -> PairRequestResult:
        """CLI initiates pairing. No auth — confirm step verifies workspace access."""
        ctx: GraphQLContext = info.context
        ws_id: uuid.UUID | None = None
        if input.workspace_slug:
            ws = (
                await ctx.db.execute(select(Workspace).where(Workspace.slug == input.workspace_slug))
            ).scalar_one_or_none()
            if ws:
                ws_id = ws.id
        if ws_id is None:
            ws = (
                await ctx.db.execute(select(Workspace).order_by(Workspace.created_at.asc()).limit(1))
            ).scalar_one_or_none()
            if not ws:
                raise ValueError("no_workspace")
            ws_id = ws.id

        code = _gen_pairing_code()
        node = AgentNode(
            workspace_id=ws_id, name=input.name, status=NodeStatus.PENDING,
            pairing_code=code, capabilities=input.capabilities,
            platform=input.platform, hostname=input.hostname,
        )
        ctx.db.add(node)
        await ctx.db.commit()
        await ctx.db.refresh(node)
        return PairRequestResult(
            node_id=node.id, pairing_code=code,
            expires_at=node.created_at + timedelta(seconds=600),
        )

    @strawberry.mutation
    async def device_pair_confirm(self, info: strawberry.Info, code: str) -> PairConfirmResult:
        """Authenticated workspace admin confirms code, server returns raw token."""
        import hashlib
        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        node = (
            await ctx.db.execute(
                select(AgentNode).where(
                    AgentNode.pairing_code == code,
                    AgentNode.workspace_id == ws_id,
                    AgentNode.status == NodeStatus.PENDING,
                )
            )
        ).scalar_one_or_none()
        if not node:
            raise ValueError("code_not_found_or_expired")
        if (datetime.now(timezone.utc) - node.created_at).total_seconds() > 600:
            node.status = NodeStatus.REVOKED
            await ctx.db.commit()
            raise ValueError("pairing_code_expired")
        raw = _gen_node_token()
        node.token_hash = hashlib.sha256(raw.encode()).hexdigest()
        node.pairing_code = None
        node.status = NodeStatus.ACTIVE
        await ctx.db.commit()
        return PairConfirmResult(node_id=node.id, name=node.name, node_token=raw)

    # ---- Billing --------------------------------------------------------

    @strawberry.mutation
    async def create_checkout_session(
        self, info: strawberry.Info, input: CheckoutSessionInput
    ) -> CheckoutSessionResult:
        """Bridge to existing billing logic so GraphQL surface is complete."""
        from bumblebee.services.billing.stripe_client import get_stripe, is_configured, new_idempotency_key
        from bumblebee.services.billing.plans import PLANS
        from bumblebee.models.workspace import WorkspacePlan as WP
        from bumblebee.config import get_settings

        ctx: GraphQLContext = info.context
        ws_id = _require_workspace(info)
        if input.workspace_id != ws_id:
            raise PermissionError("workspace_mismatch")
        ws = await ctx.db.get(Workspace, ws_id)
        if not ws:
            raise ValueError("workspace_not_found")
        if not is_configured():
            raise RuntimeError("billing_not_configured")
        stripe = get_stripe()
        s = get_settings()
        if input.plan == "pro":
            base_price = s.stripe_price_pro_id
            usage_price = None
        elif input.plan == "team":
            base_price = s.stripe_price_team_id
            usage_price = s.stripe_price_team_usage_id
        else:
            raise ValueError("unknown_plan")

        if not ws.stripe_customer_id:
            cust = stripe.Customer.create(
                name=ws.name,
                metadata={"bb_workspace_id": str(ws.id), "bb_slug": ws.slug},
                idempotency_key=new_idempotency_key(f"cust-{ws.id}"),
            )
            ws.stripe_customer_id = cust.id
            await ctx.db.commit()
            await ctx.db.refresh(ws)

        line_items = [{"price": base_price, "quantity": input.seats}]
        if usage_price:
            line_items.append({"price": usage_price})
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=ws.stripe_customer_id,
            line_items=line_items,
            success_url=f"{s.web_base_url}/settings/billing?status=success&session={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{s.web_base_url}/settings/billing?status=cancel",
            client_reference_id=str(ws.id),
            metadata={"bb_workspace_id": str(ws.id), "bb_plan": input.plan},
            idempotency_key=new_idempotency_key(f"checkout-{ws.id}-{input.plan}"),
        )
        return CheckoutSessionResult(session_id=session.id, url=session.url)
