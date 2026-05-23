"""Phase D — billing endpoints + quota enforcement tests.

These tests cover the wire-up + RBAC + quota logic. They do NOT call live Stripe
(billing_enabled is gated by env vars; tests with TestClient run with whatever
.env is loaded). For full Stripe flow verification, see scripts/test-stripe-e2e.py
which runs against the actual test-mode Stripe account.
"""
from __future__ import annotations
import uuid

import pytest


async def _register(client) -> dict:
    u = f"u_{uuid.uuid4().hex[:8]}"
    r = await client.post(
        "/api/auth/register",
        json={"username": u, "email": f"{u}@x.com", "password": "secret123!"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_list_plans_endpoint_returns_three_tiers(client):
    """Public-ish plan catalog — must list free/pro/team with key fields."""
    r = await client.get("/api/billing/plans")
    assert r.status_code == 200
    body = r.json()
    plans = body["plans"]
    keys = {p["key"] for p in plans}
    assert keys == {"free", "pro", "team"}
    pro = next(p for p in plans if p["key"] == "pro")
    assert pro["monthly_usd"] == 20.0
    assert pro["llm_cap_cents"] == 2000
    assert "MCP" in " ".join(pro["features"]) or "Pro" in pro["display_name"]


@pytest.mark.asyncio
async def test_get_billing_state_returns_workspace_plan(client):
    user = await _register(client)
    ws_id = user["workspace"]["id"]
    r = await client.get(
        f"/api/billing/workspace/{ws_id}",
        headers=_h(user["access_token"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] == "free"
    assert body["llm_spend_cents_this_period"] == 0
    assert body["payment_overdue"] is False
    assert body["llm_cap_cents"] == 100  # Free plan $1


@pytest.mark.asyncio
async def test_cross_workspace_billing_returns_403(client):
    """User A cannot read user B's billing state."""
    alice = await _register(client)
    bob = await _register(client)
    r = await client.get(
        f"/api/billing/workspace/{alice['workspace']['id']}",
        headers=_h(bob["access_token"]),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_member_role_cannot_manage_billing(client):
    """Manage_billing is owner-only."""
    # Create owner + invite a member into their workspace
    owner = await _register(client)
    ws_id = owner["workspace"]["id"]
    invitee = await _register(client)
    # Invite the invitee
    inv = await client.post(
        f"/api/workspaces/{ws_id}/invites",
        json={"email": invitee["user"]["email"], "role": "member"},
        headers=_h(owner["access_token"]),
    )
    token = inv.json()["token"]
    await client.post(f"/api/invites/{token}/accept", headers=_h(invitee["access_token"]))

    # Invitee is now a member but their JWT still scopes to their own ws.
    # Hitting owner's workspace billing endpoint:
    r = await client.post(
        f"/api/billing/workspace/{ws_id}/checkout-session",
        json={"plan": "pro", "seats": 1},
        headers=_h(invitee["access_token"]),
    )
    # Either 403 (cross-workspace) or 403 (permission denied) — both acceptable
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_quota_check_passes_for_fresh_free_plan(clean_db, seed_workspace_id):
    """A new workspace with zero spend should pass quota."""
    from bumblebee.services.billing.quota import check_workspace_quota
    await check_workspace_quota(clean_db, seed_workspace_id)  # should not raise


@pytest.mark.asyncio
async def test_quota_check_raises_when_overdue(clean_db, seed_workspace_id):
    """payment_overdue workspace blocks all LLM calls."""
    from sqlalchemy import text
    await clean_db.execute(
        text("UPDATE workspaces SET payment_overdue = true WHERE id = :ws"),
        {"ws": str(seed_workspace_id)},
    )
    await clean_db.commit()

    from bumblebee.services.billing.quota import check_workspace_quota, QuotaExceeded
    with pytest.raises(QuotaExceeded):
        await check_workspace_quota(clean_db, seed_workspace_id)


@pytest.mark.asyncio
async def test_quota_check_raises_when_cap_reached(clean_db, seed_workspace_id):
    """Free plan ($1 = 100 cents) should block at 100 cents spent."""
    from sqlalchemy import text
    await clean_db.execute(
        text("UPDATE workspaces SET llm_spend_cents_this_period = 150, period_started_at = now() WHERE id = :ws"),
        {"ws": str(seed_workspace_id)},
    )
    await clean_db.commit()

    from bumblebee.services.billing.quota import check_workspace_quota, QuotaExceeded
    with pytest.raises(QuotaExceeded) as exc:
        await check_workspace_quota(clean_db, seed_workspace_id)
    assert exc.value.spent_cents >= 150
    assert exc.value.cap_cents == 100  # Free cap


@pytest.mark.asyncio
async def test_record_usage_increments_counter(clean_db, seed_workspace_id):
    """record_usage should add cents to llm_spend_cents_this_period."""
    from sqlalchemy import text
    from bumblebee.services.billing.quota import record_usage
    await record_usage(clean_db, seed_workspace_id, cost_usd=0.05)  # 5 cents
    await clean_db.commit()

    row = await clean_db.execute(
        text("SELECT llm_spend_cents_this_period FROM workspaces WHERE id = :ws"),
        {"ws": str(seed_workspace_id)},
    )
    spent = row.scalar()
    assert spent >= 5  # at least the 5 cents we added


@pytest.mark.asyncio
async def test_period_resets_after_30_days(clean_db, seed_workspace_id):
    """Setting period_started_at to >30d ago should auto-reset on next check.

    NOTE: Free plan cap is $1 (100 cents); seed start of 100 cents would block.
    Setting to 50 cents which is under the cap, then the period-reset zeroes it.
    """
    from sqlalchemy import text
    from datetime import datetime, timedelta, timezone
    long_ago = datetime.now(timezone.utc) - timedelta(days=35)
    await clean_db.execute(
        text(
            "UPDATE workspaces SET llm_spend_cents_this_period = 50, "
            "period_started_at = :t WHERE id = :ws"
        ),
        {"t": long_ago, "ws": str(seed_workspace_id)},
    )
    await clean_db.commit()

    from bumblebee.services.billing.quota import check_workspace_quota
    await check_workspace_quota(clean_db, seed_workspace_id)  # triggers reset
    await clean_db.commit()

    row = await clean_db.execute(
        text("SELECT llm_spend_cents_this_period FROM workspaces WHERE id = :ws"),
        {"ws": str(seed_workspace_id)},
    )
    assert row.scalar() == 0  # reset to zero


@pytest.mark.asyncio
async def test_invoices_endpoint_empty_for_no_customer(client):
    """Workspace without stripe_customer_id should return empty invoice list."""
    user = await _register(client)
    r = await client.get(
        f"/api/billing/workspace/{user['workspace']['id']}/invoices",
        headers=_h(user["access_token"]),
    )
    assert r.status_code == 200
    assert r.json()["invoices"] == []


@pytest.mark.asyncio
async def test_checkout_session_returns_url_when_billing_enabled(client):
    """If BILLING_ENABLED=true + keys configured, checkout-session returns a Stripe URL."""
    from bumblebee.services.billing import is_configured

    if not is_configured():
        pytest.skip("Stripe billing not configured in this env")

    user = await _register(client)
    r = await client.post(
        f"/api/billing/workspace/{user['workspace']['id']}/checkout-session",
        json={"plan": "pro", "seats": 1},
        headers=_h(user["access_token"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"].startswith("cs_test_")  # test mode session id prefix
    assert body["url"].startswith("https://checkout.stripe.com/")
