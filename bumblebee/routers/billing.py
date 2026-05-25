"""Billing endpoints — Checkout session creation + invoice list + plan info.

Phase D wires this on top of the Phase A scaffolding (Stripe SDK, plans catalog,
webhook handler skeleton). Webhook handlers (`bumblebee/routers/stripe_webhooks.py`)
flip workspace.plan / payment_overdue based on Stripe events.
"""
from __future__ import annotations

import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.config import get_settings
from bumblebee.database import get_db
from bumblebee.models.workspace import Workspace
from bumblebee.services.billing import StripeNotConfigured, get_stripe, is_configured
from bumblebee.services.billing.plans import PLANS, plan_for
from bumblebee.services.billing.stripe_client import new_idempotency_key
from bumblebee.services.rbac import (
    CurrentWorkspace,
    Permission,
    require_permission,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutSessionRequest(BaseModel):
    plan: Literal["pro", "team"]
    seats: int = 1


class CheckoutSessionResponse(BaseModel):
    session_id: str
    url: str


def _resolve_price_id(plan: str) -> tuple[str, str | None]:
    """Return (base_price_id, optional_usage_price_id) for the requested plan."""
    s = get_settings()
    if plan == "pro":
        if not s.stripe_price_pro_id:
            raise HTTPException(503, "stripe_price_pro_id_not_configured")
        return s.stripe_price_pro_id, None
    if plan == "team":
        if not s.stripe_price_team_id:
            raise HTTPException(503, "stripe_price_team_id_not_configured")
        return s.stripe_price_team_id, s.stripe_price_team_usage_id or None
    raise HTTPException(400, "unknown_plan")


@router.get("/plans")
async def list_plans():
    """Catalog of plans for the pricing page + settings UI."""
    return {
        "plans": [
            {
                "key": p.key.value,
                "display_name": p.display_name,
                "blurb": p.blurb,
                "monthly_usd": p.monthly_usd,
                "llm_cap_cents": p.llm_cap_cents,
                "max_active_issues": p.max_active_issues,
                "max_workspaces": p.max_workspaces,
                "seats_included": p.seats_included,
                "features": list(p.feature_bullets),
            }
            for p in PLANS.values()
        ],
        "billing_enabled": is_configured(),
    }


@router.get("/workspace/{ws_id}")
async def get_billing_state(
    ws_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Current plan + spend + overdue state for a workspace."""
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")
    plan = plan_for(ws.plan)
    return {
        "plan": ws.plan.value,
        "plan_display_name": plan.display_name,
        "stripe_customer_id": ws.stripe_customer_id,
        "stripe_subscription_id": ws.stripe_subscription_id,
        "llm_spend_cents_this_period": ws.llm_spend_cents_this_period,
        "llm_cap_cents": plan.llm_cap_cents,
        "period_started_at": ws.period_started_at.isoformat() if ws.period_started_at else None,
        "payment_overdue": ws.payment_overdue,
        "payment_overdue_since": ws.payment_overdue_since.isoformat() if ws.payment_overdue_since else None,
    }


@router.post("/workspace/{ws_id}/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    ws_id: uuid.UUID,
    body: CheckoutSessionRequest,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Checkout session for the workspace to upgrade to Pro or Team."""
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")

    if not is_configured():
        raise HTTPException(503, "billing_not_configured")

    try:
        stripe = get_stripe()
    except StripeNotConfigured as e:
        raise HTTPException(503, str(e))

    get_settings()
    base_price, usage_price = _resolve_price_id(body.plan)

    # Idempotently ensure a Stripe Customer exists for this workspace
    if not ws.stripe_customer_id:
        cust = stripe.Customer.create(
            name=ws.name,
            metadata={"bb_workspace_id": str(ws.id), "bb_slug": ws.slug},
            idempotency_key=new_idempotency_key(f"cust-{ws.id}"),
        )
        ws.stripe_customer_id = cust.id
        await db.commit()
        await db.refresh(ws)

    # Build line_items: base price × seats + optional metered usage (team)
    line_items = [{"price": base_price, "quantity": body.seats}]
    if usage_price:
        line_items.append({"price": usage_price})

    success_url = "http://localhost:3000/settings/billing?status=success&session={CHECKOUT_SESSION_ID}"
    cancel_url = "http://localhost:3000/settings/billing?status=cancel"

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=ws.stripe_customer_id,
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(ws.id),
        metadata={"bb_workspace_id": str(ws.id), "bb_plan": body.plan},
        idempotency_key=new_idempotency_key(f"checkout-{ws.id}-{body.plan}"),
    )
    return CheckoutSessionResponse(session_id=session.id, url=session.url)


@router.get("/workspace/{ws_id}/invoices")
async def list_invoices(
    ws_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.READ_BILLING)),
    db: AsyncSession = Depends(get_db),
    limit: int = 12,
):
    """List recent invoices from Stripe for this workspace's customer."""
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")
    if not ws.stripe_customer_id:
        return {"invoices": []}
    if not is_configured():
        raise HTTPException(503, "billing_not_configured")
    stripe = get_stripe()
    invs = stripe.Invoice.list(customer=ws.stripe_customer_id, limit=limit)
    return {
        "invoices": [
            {
                "id": inv.id,
                "number": inv.number,
                "status": inv.status,
                "amount_paid": inv.amount_paid,
                "amount_due": inv.amount_due,
                "currency": inv.currency,
                "hosted_invoice_url": inv.hosted_invoice_url,
                "invoice_pdf": inv.invoice_pdf,
                "created": inv.created,
                "period_start": inv.period_start,
                "period_end": inv.period_end,
            }
            for inv in invs.data
        ]
    }


@router.post("/workspace/{ws_id}/cancel")
async def cancel_subscription(
    ws_id: uuid.UUID,
    ws_ctx: CurrentWorkspace = Depends(require_permission(Permission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Cancel the workspace's subscription at period end."""
    if ws_id != ws_ctx.workspace_id:
        raise HTTPException(403, "not_a_member")
    ws = await db.get(Workspace, ws_id)
    if not ws or ws.deleted_at:
        raise HTTPException(403, "not_a_member")
    if not ws.stripe_subscription_id:
        raise HTTPException(400, "no_active_subscription")
    if not is_configured():
        raise HTTPException(503, "billing_not_configured")
    stripe = get_stripe()
    sub = stripe.Subscription.modify(
        ws.stripe_subscription_id,
        cancel_at_period_end=True,
    )
    return {"status": sub.status, "cancel_at_period_end": sub.cancel_at_period_end}
