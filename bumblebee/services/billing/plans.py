"""Plan catalog — declares the 3 tiers we sell.

Used by:
- `scripts/stripe_setup_catalog.py` to create Stripe Products + Prices
- Quota enforcement (Phase D)
- Pricing page (Phase F)
"""
from __future__ import annotations
from dataclasses import dataclass

from bumblebee.models.workspace import WorkspacePlan


@dataclass(frozen=True)
class Plan:
    key: WorkspacePlan
    display_name: str
    blurb: str
    monthly_usd: float
    """Recurring per-seat monthly fee in USD. 0 for free."""

    llm_cap_cents: int | None
    """Monthly LLM spend cap in cents. None = unlimited (team passthrough)."""

    max_active_issues: int | None
    """None = unlimited."""

    max_workspaces: int
    """How many workspaces a single user can own on this plan."""

    seats_included: int
    """Free seats; extras billed (future)."""

    feature_bullets: tuple[str, ...]


PLANS: dict[WorkspacePlan, Plan] = {
    WorkspacePlan.FREE: Plan(
        key=WorkspacePlan.FREE,
        display_name="Free",
        blurb="Get started — single workspace, capped LLM spend.",
        monthly_usd=0.0,
        llm_cap_cents=100,        # $1 / month
        max_active_issues=5,
        max_workspaces=1,
        seats_included=1,
        feature_bullets=(
            "1 workspace",
            "5 active issues",
            "$1/mo LLM budget",
            "Community support",
        ),
    ),
    WorkspacePlan.PRO: Plan(
        key=WorkspacePlan.PRO,
        display_name="Pro",
        blurb="For solo devs + small teams running real workloads.",
        monthly_usd=20.0,
        llm_cap_cents=2000,       # $20 / seat / month
        max_active_issues=None,
        max_workspaces=5,
        seats_included=1,
        feature_bullets=(
            "5 workspaces",
            "Unlimited issues",
            "$20/mo LLM budget per seat",
            "MCP server + Claude Code integration",
            "Email support (48h)",
        ),
    ),
    WorkspacePlan.TEAM: Plan(
        key=WorkspacePlan.TEAM,
        display_name="Team",
        blurb="LLM-cost passthrough + unlimited everything.",
        monthly_usd=100.0,
        llm_cap_cents=None,       # no cap, metered usage
        max_active_issues=None,
        max_workspaces=999,
        seats_included=5,
        feature_bullets=(
            "Unlimited workspaces + issues",
            "LLM cost passthrough (Stripe metered)",
            "5 seats included; $20/extra",
            "Audit log + CSV export",
            "Priority support (24h)",
            "SOC2-prep docs",
        ),
    ),
}


def plan_for(key: WorkspacePlan) -> Plan:
    return PLANS[key]
