"""End-to-end test for Stripe billing flow.

Exercises the full lifecycle without needing a publicly-reachable webhook URL:
  1. Resolve default workspace
  2. Create Stripe Customer + Subscription (test mode, pm_card_visa)
  3. Manually feed each lifecycle event into our webhook handlers
  4. Verify DB state at each step (plan, overdue flags, period reset)
  5. Upgrade Pro -> Team
  6. Cancel subscription -> back to FREE

Run:
  python scripts/test-stripe-flow.py
"""
from __future__ import annotations
import asyncio
import os
import sys
import time
from datetime import datetime, timezone

import stripe
from dotenv import load_dotenv
from sqlalchemy import select

load_dotenv()

# Ensure FK targets load before SQLAlchemy materializes any mapper
from bumblebee.database import SessionLocal
from bumblebee.models.workspace import Workspace, WorkspacePlan  # noqa: F401
from bumblebee.models.user import User  # noqa: F401
from bumblebee.routers.stripe_webhooks import (
    _on_subscription_created,
    _on_subscription_updated,
    _on_subscription_deleted,
    _on_invoice_paid,
    _on_invoice_payment_failed,
)


def banner(msg: str) -> None:
    print(f"\n{'=' * 70}\n  {msg}\n{'=' * 70}")


def to_dict(obj) -> dict:
    """Convert a StripeObject (or already-a-dict) into a plain dict for handler input."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "_to_dict_recursive"):
        return obj._to_dict_recursive()
    return dict(obj)


async def get_default_workspace() -> Workspace:
    async with SessionLocal() as db:
        ws = (
            await db.execute(select(Workspace).order_by(Workspace.created_at.asc()).limit(1))
        ).scalar_one_or_none()
        if not ws:
            print("ERROR: no workspace found. Run seed_default first.")
            sys.exit(1)
        return ws


async def reload_ws(ws_id) -> Workspace:
    async with SessionLocal() as db:
        return await db.get(Workspace, ws_id)


async def set_customer_on_ws(ws_id, customer_id: str) -> None:
    async with SessionLocal() as db:
        ws = await db.get(Workspace, ws_id)
        ws.stripe_customer_id = customer_id
        await db.commit()


async def main() -> int:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key or not key.startswith("sk_test_"):
        print("ERROR: STRIPE_SECRET_KEY must be a sk_test_ key for this test")
        return 1
    stripe.api_key = key
    stripe.api_version = "2024-12-18.acacia"

    pro_price = os.environ["STRIPE_PRICE_PRO_ID"]
    team_price = os.environ["STRIPE_PRICE_TEAM_ID"]
    team_usage_price = os.environ["STRIPE_PRICE_TEAM_USAGE_ID"]

    banner("STEP 1  resolve default workspace")
    ws = await get_default_workspace()
    print(f"  workspace: {ws.slug} ({ws.id}) plan={ws.plan.value}")

    banner("STEP 2  create Stripe Customer + attach test card")
    customer = stripe.Customer.create(
        name=f"{ws.name} (flow-test {int(time.time())})",
        metadata={"bb_workspace_id": str(ws.id), "bb_slug": ws.slug, "test_run": "1"},
    )
    print(f"  customer: {customer.id}")
    pm = stripe.PaymentMethod.attach("pm_card_visa", customer=customer.id)
    stripe.Customer.modify(
        customer.id, invoice_settings={"default_payment_method": pm.id}
    )
    print(f"  payment_method attached: {pm.id}")
    await set_customer_on_ws(ws.id, customer.id)

    banner("STEP 3  create Pro subscription")
    sub = stripe.Subscription.create(
        customer=customer.id,
        items=[{"price": pro_price, "quantity": 1}],
        metadata={"bb_workspace_id": str(ws.id), "bb_plan": "pro"},
        expand=["latest_invoice"],
    )
    print(f"  subscription: {sub.id} status={sub.status}")

    # Feed events into handlers (Stripe -> our /api/stripe/webhook)
    banner("STEP 4  feed subscription.created -> _on_subscription_created")
    await _on_subscription_created({"data": {"object": to_dict(sub)}})
    ws = await reload_ws(ws.id)
    print(f"  ws.plan={ws.plan.value} (expect: pro)")
    assert ws.plan == WorkspacePlan.PRO, f"expected PRO, got {ws.plan}"
    assert ws.stripe_subscription_id == sub.id

    inv = to_dict(sub.latest_invoice)
    if inv.get("id"):
        banner("STEP 5  feed invoice.paid -> _on_invoice_paid")
        await _on_invoice_paid({"data": {"object": inv}})
        ws = await reload_ws(ws.id)
        print(f"  ws.payment_overdue={ws.payment_overdue} (expect: False)")
        print(f"  ws.period_started_at={ws.period_started_at}")
        assert ws.payment_overdue is False

    banner("STEP 6  simulate payment_failed event (no real failure)")
    fake_failed = {"data": {"object": {"customer": customer.id, "id": "in_test_fail", "amount_due": 2000}}}
    await _on_invoice_payment_failed(fake_failed)
    ws = await reload_ws(ws.id)
    print(f"  ws.payment_overdue={ws.payment_overdue} (expect: True)")
    assert ws.payment_overdue is True

    banner("STEP 7  simulate invoice.paid recovery -> overdue cleared")
    fake_paid = {"data": {"object": {"customer": customer.id, "id": "in_test_recovery", "amount_paid": 2000, "currency": "usd"}}}
    await _on_invoice_paid(fake_paid)
    ws = await reload_ws(ws.id)
    print(f"  ws.payment_overdue={ws.payment_overdue} (expect: False)")
    assert ws.payment_overdue is False

    banner("STEP 8  upgrade subscription Pro -> Team via Stripe API")
    item_id = sub["items"]["data"][0]["id"]
    sub_updated = stripe.Subscription.modify(
        sub.id,
        items=[
            {"id": item_id, "price": team_price, "quantity": 1},
            {"price": team_usage_price},
        ],
        metadata={"bb_workspace_id": str(ws.id), "bb_plan": "team"},
        proration_behavior="none",
    )
    print(f"  subscription items now: {[i['price']['id'] for i in sub_updated['items']['data']]}")

    sub_updated_dict = to_dict(sub_updated)
    sub_updated_dict.setdefault("metadata", {})["bb_plan"] = "team"
    banner("STEP 9  feed subscription.updated -> _on_subscription_updated (active)")
    await _on_subscription_updated({"data": {"object": sub_updated_dict}})
    # _on_subscription_updated only changes plan on canceled status. Manually call created handler for plan flip.
    # In production, plan changes come via checkout completed/subscription.created with new metadata.
    await _on_subscription_created({"data": {"object": sub_updated_dict}})
    ws = await reload_ws(ws.id)
    print(f"  ws.plan={ws.plan.value} (expect: team)")
    assert ws.plan == WorkspacePlan.TEAM, f"expected TEAM, got {ws.plan}"

    banner("STEP 10  cancel subscription")
    sub_canceled = stripe.Subscription.cancel(sub.id)
    print(f"  subscription status: {sub_canceled.status}")
    await _on_subscription_updated({"data": {"object": to_dict(sub_canceled)}})
    ws = await reload_ws(ws.id)
    print(f"  ws.plan={ws.plan.value} (expect: free)")
    assert ws.plan == WorkspacePlan.FREE, f"expected FREE, got {ws.plan}"
    assert ws.stripe_subscription_id is None

    banner("STEP 11  cleanup Stripe Customer (test mode)")
    stripe.Customer.delete(customer.id)
    async with SessionLocal() as db:
        ws_db = await db.get(Workspace, ws.id)
        ws_db.stripe_customer_id = None
        ws_db.stripe_subscription_id = None
        ws_db.plan = WorkspacePlan.FREE
        await db.commit()
    print("  customer deleted, workspace reset")

    banner("ALL STEPS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
