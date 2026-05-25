"""Stripe webhook endpoint — verifies signatures + dispatches by event.type.

Phase D wires the 5 handlers we need. Each is idempotent via the `processed_webhooks`
in-memory cache (production should persist this to DB or Redis for HA).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select

from bumblebee.config import get_settings
from bumblebee.database import SessionLocal
from bumblebee.models.workspace import Workspace, WorkspacePlan
from bumblebee.services.state.event_log import append_event

log = logging.getLogger(__name__)
router = APIRouter(tags=["stripe"])


# Idempotency guard — in-memory for v1; persist for HA.
_PROCESSED: set[str] = set()
_MAX_PROCESSED = 10_000


def _seen(event_id: str) -> bool:
    if event_id in _PROCESSED:
        return True
    _PROCESSED.add(event_id)
    if len(_PROCESSED) > _MAX_PROCESSED:
        # Drop the oldest half (sets are unordered, so this is approximate)
        for k in list(_PROCESSED)[: _MAX_PROCESSED // 2]:
            _PROCESSED.discard(k)
    return False


@router.post("/api/stripe/webhook", status_code=200)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
):
    """Receive + verify + dispatch a Stripe webhook event."""
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "stripe_webhook_secret not configured",
        )

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.stripe_webhook_secret
        )
    except (stripe.error.SignatureVerificationError, ValueError) as e:
        log.warning("stripe webhook signature failed: %s", e)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid_signature")

    if _seen(event["id"]):
        return {"received": True, "type": event["type"], "deduped": True}

    handler = _DISPATCH.get(event["type"], _on_unhandled)
    await handler(event)
    return {"received": True, "type": event["type"]}


# ---- Workspace resolver ------------------------------------------------------


async def _workspace_for_customer(db, customer_id: str) -> Workspace | None:
    return (
        await db.execute(
            select(Workspace).where(Workspace.stripe_customer_id == customer_id)
        )
    ).scalar_one_or_none()


# ---- Handlers --------------------------------------------------------------


async def _on_subscription_created(event: dict) -> None:
    sub = event["data"]["object"]
    customer_id = sub.get("customer")
    if not customer_id:
        return
    async with SessionLocal() as db:
        ws = await _workspace_for_customer(db, customer_id)
        if not ws:
            log.warning("subscription_created for unknown customer %s", customer_id)
            return
        # Derive plan from the first non-metered price metadata
        plan_key = sub.get("metadata", {}).get("bb_plan", "pro")
        try:
            ws.plan = WorkspacePlan(plan_key)
        except ValueError:
            ws.plan = WorkspacePlan.PRO
        ws.stripe_subscription_id = sub.get("id")
        ws.payment_overdue = False
        ws.payment_overdue_since = None
        ws.period_started_at = datetime.now(UTC)
        ws.llm_spend_cents_this_period = 0
        await db.commit()
        await append_event(
            db,
            type="subscription_created",
            workspace_id=ws.id,
            payload={"plan": ws.plan.value, "subscription_id": sub.get("id")},
            source="stripe",
        )
        await db.commit()
        log.info("subscription_created: workspace=%s plan=%s", ws.id, ws.plan.value)


async def _on_subscription_updated(event: dict) -> None:
    sub = event["data"]["object"]
    customer_id = sub.get("customer")
    if not customer_id:
        return
    async with SessionLocal() as db:
        ws = await _workspace_for_customer(db, customer_id)
        if not ws:
            return
        # status: active / past_due / canceled / unpaid / trialing
        status_str = sub.get("status", "")
        if status_str == "canceled":
            ws.plan = WorkspacePlan.FREE
            ws.stripe_subscription_id = None
        elif status_str == "past_due":
            ws.payment_overdue = True
            ws.payment_overdue_since = ws.payment_overdue_since or datetime.now(UTC)
        else:
            ws.payment_overdue = False
            ws.payment_overdue_since = None
        await db.commit()
        await append_event(
            db,
            type="subscription_updated",
            workspace_id=ws.id,
            payload={"status": status_str, "plan": ws.plan.value},
            source="stripe",
        )
        await db.commit()


async def _on_subscription_deleted(event: dict) -> None:
    sub = event["data"]["object"]
    customer_id = sub.get("customer")
    if not customer_id:
        return
    async with SessionLocal() as db:
        ws = await _workspace_for_customer(db, customer_id)
        if not ws:
            return
        ws.plan = WorkspacePlan.FREE
        ws.stripe_subscription_id = None
        await db.commit()
        await append_event(
            db, type="subscription_canceled", workspace_id=ws.id, payload={}, source="stripe",
        )
        await db.commit()


async def _on_invoice_paid(event: dict) -> None:
    inv = event["data"]["object"]
    customer_id = inv.get("customer")
    if not customer_id:
        return
    async with SessionLocal() as db:
        ws = await _workspace_for_customer(db, customer_id)
        if not ws:
            return
        ws.payment_overdue = False
        ws.payment_overdue_since = None
        # On a fresh billing period, reset the spend counter
        ws.llm_spend_cents_this_period = 0
        ws.period_started_at = datetime.now(UTC)
        await db.commit()
        await append_event(
            db,
            type="subscription_paid",
            workspace_id=ws.id,
            payload={
                "invoice_id": inv.get("id"),
                "amount_paid": inv.get("amount_paid"),
                "currency": inv.get("currency"),
            },
            source="stripe",
        )
        await db.commit()


async def _on_invoice_payment_failed(event: dict) -> None:
    inv = event["data"]["object"]
    customer_id = inv.get("customer")
    if not customer_id:
        return
    async with SessionLocal() as db:
        ws = await _workspace_for_customer(db, customer_id)
        if not ws:
            return
        ws.payment_overdue = True
        ws.payment_overdue_since = datetime.now(UTC)
        await db.commit()
        await append_event(
            db,
            type="payment_failed",
            workspace_id=ws.id,
            payload={"invoice_id": inv.get("id"), "amount_due": inv.get("amount_due")},
            source="stripe",
        )
        await db.commit()


async def _on_unhandled(event: dict) -> None:
    log.debug("stripe webhook unhandled: %s", event["type"])


_DISPATCH = {
    "customer.subscription.created": _on_subscription_created,
    "customer.subscription.updated": _on_subscription_updated,
    "customer.subscription.deleted": _on_subscription_deleted,
    "invoice.paid": _on_invoice_paid,
    "invoice.payment_failed": _on_invoice_payment_failed,
}
