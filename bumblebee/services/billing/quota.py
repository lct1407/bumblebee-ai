"""Per-workspace LLM-spend quota enforcement (Phase D).

`check_workspace_quota` is called by the harness BEFORE each LLM call. Free + Pro
plans block when monthly spend exceeds the cap; Team has no cap (passthrough billing).

After each successful LLM call, `record_usage` increments the workspace counter
AND (for Team plan) reports a metered usage record to Stripe so the customer is
charged the raw cost on their next invoice.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.config import get_settings
from bumblebee.models.workspace import Workspace, WorkspacePlan
from bumblebee.services.billing.plans import plan_for
from bumblebee.services.billing.stripe_client import (
    StripeNotConfigured,
    get_stripe,
    is_configured,
    new_idempotency_key,
)

log = logging.getLogger(__name__)


class QuotaExceeded(Exception):
    """Raised when a workspace tries to incur LLM cost past its plan cap."""
    def __init__(self, plan: str, spent_cents: int, cap_cents: int):
        super().__init__(
            f"plan={plan} llm budget exceeded: "
            f"${spent_cents / 100:.2f} spent, ${cap_cents / 100:.2f} cap"
        )
        self.plan = plan
        self.spent_cents = spent_cents
        self.cap_cents = cap_cents


def _period_expired(ws: Workspace) -> bool:
    """True if 30+ days have passed since the current period started."""
    if not ws.period_started_at:
        return True
    return datetime.now(UTC) - ws.period_started_at >= timedelta(days=30)


async def _maybe_reset_period(db: AsyncSession, ws: Workspace) -> None:
    """Roll the workspace's billing period if expired. Idempotent."""
    if _period_expired(ws):
        ws.llm_spend_cents_this_period = 0
        ws.period_started_at = datetime.now(UTC)
        await db.flush()


async def check_workspace_quota(db: AsyncSession, workspace_id: uuid.UUID) -> None:
    """Raise QuotaExceeded if workspace can't make another LLM call."""
    ws = await db.get(Workspace, workspace_id)
    if not ws or ws.deleted_at:
        return  # caller will fail with proper 403 elsewhere

    if ws.payment_overdue:
        raise QuotaExceeded(
            plan=ws.plan.value, spent_cents=ws.llm_spend_cents_this_period, cap_cents=0
        )

    await _maybe_reset_period(db, ws)

    plan = plan_for(ws.plan)
    if plan.llm_cap_cents is None:
        # Team plan: no cap (metered passthrough)
        return
    if ws.llm_spend_cents_this_period >= plan.llm_cap_cents:
        raise QuotaExceeded(
            plan=ws.plan.value,
            spent_cents=ws.llm_spend_cents_this_period,
            cap_cents=plan.llm_cap_cents,
        )


async def record_usage(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    cost_usd: float,
    *,
    event_idempotency_key: str | None = None,
) -> None:
    """Increment the workspace's period spend AND push metered usage to Stripe for Team plans.

    cost_usd is the raw LLM provider cost; converted to integer cents internally.
    Idempotency key prevents double-charging on retry.
    """
    if cost_usd <= 0:
        return
    cents = max(1, round(cost_usd * 100))

    ws = await db.get(Workspace, workspace_id)
    if not ws or ws.deleted_at:
        return

    await _maybe_reset_period(db, ws)
    ws.llm_spend_cents_this_period += cents
    await db.flush()

    # Team plan: report metered usage to Stripe so they invoice the raw cost
    if ws.plan == WorkspacePlan.TEAM and ws.stripe_subscription_id and is_configured():
        s = get_settings()
        if not s.stripe_price_team_usage_id:
            log.debug("team plan but STRIPE_PRICE_TEAM_USAGE_ID not configured; skipping passthrough")
            return
        try:
            stripe = get_stripe()
            # Find the subscription item that corresponds to the usage price
            sub = stripe.Subscription.retrieve(ws.stripe_subscription_id)
            usage_item = next(
                (item for item in sub["items"]["data"] if item["price"]["id"] == s.stripe_price_team_usage_id),
                None,
            )
            if usage_item:
                stripe.SubscriptionItem.create_usage_record(
                    usage_item.id,
                    quantity=cents,
                    timestamp=int(datetime.now(UTC).timestamp()),
                    action="increment",
                    idempotency_key=event_idempotency_key or new_idempotency_key(f"usage-{workspace_id}"),
                )
        except StripeNotConfigured:
            pass
        except Exception as exc:
            log.warning("stripe usage report failed for workspace %s: %s", workspace_id, exc)
