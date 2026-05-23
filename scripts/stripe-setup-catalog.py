"""One-shot script: create Stripe Products + Prices matching bumblebee.services.billing.plans.

Idempotent - checks for existing Products by metadata.bb_plan_key before creating.
After running, prints the Price IDs to paste into .env:
  STRIPE_PRICE_PRO_ID
  STRIPE_PRICE_TEAM_ID
  STRIPE_PRICE_TEAM_USAGE_ID

Run with:
  python scripts/stripe-setup-catalog.py

Requires STRIPE_SECRET_KEY in .env (test or live; recommend test for dev).
"""
from __future__ import annotations
import os
import sys

import stripe
from dotenv import load_dotenv

load_dotenv()


def _resolve_key() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        print("ERROR: STRIPE_SECRET_KEY not set in environment.", file=sys.stderr)
        sys.exit(1)
    if key.startswith("sk_live_"):
        print("[!] Detected LIVE Stripe key. Catalog setup will create real products.")
        print("   Continue? [y/N]: ", end="", flush=True)
        if input().strip().lower() != "y":
            sys.exit(0)
    return key


def find_or_create_product(name: str, description: str, plan_key: str) -> stripe.Product:
    """Idempotent: look up by metadata.bb_plan_key, else create."""
    existing = stripe.Product.search(
        query=f'metadata["bb_plan_key"]:"{plan_key}"', limit=1
    )
    if existing.data:
        print(f"  [skip] Product exists: {plan_key} ({existing.data[0].id})")
        return existing.data[0]
    prod = stripe.Product.create(
        name=name,
        description=description,
        metadata={"bb_plan_key": plan_key},
    )
    print(f"  [ok]   Product created: {plan_key} -> {prod.id}")
    return prod


def find_or_create_price(
    product_id: str,
    unit_amount_cents: int,
    nickname: str,
    *,
    usage_type: str = "licensed",
    aggregate_usage: str | None = None,
) -> stripe.Price:
    """Idempotent: look up by metadata.bb_nickname, else create.

    usage_type='metered' creates a Stripe metered Price (for LLM cost passthrough).
    """
    existing = stripe.Price.search(
        query=f'metadata["bb_nickname"]:"{nickname}"', limit=1
    )
    if existing.data:
        print(f"    [skip] Price exists: {nickname} ({existing.data[0].id})")
        return existing.data[0]

    kwargs: dict = {
        "product": product_id,
        "currency": "usd",
        "recurring": {"interval": "month", "usage_type": usage_type},
        "metadata": {"bb_nickname": nickname},
        "nickname": nickname,
    }
    if usage_type == "metered":
        kwargs["billing_scheme"] = "per_unit"
        kwargs["unit_amount_decimal"] = "1"  # 1 cent per unit (will scale via usage reports)
        if aggregate_usage:
            kwargs["recurring"]["aggregate_usage"] = aggregate_usage
    else:
        kwargs["unit_amount"] = unit_amount_cents

    price = stripe.Price.create(**kwargs)
    print(f"    [ok]   Price created: {nickname} -> {price.id}")
    return price


def main() -> None:
    stripe.api_key = _resolve_key()
    stripe.api_version = "2024-12-18.acacia"

    print("Bumblebee Stripe catalog setup\n=================================\n")

    # Pro plan
    print("Pro plan:")
    pro_prod = find_or_create_product(
        "Bumblebee Pro",
        "Per-seat Pro plan - 5 workspaces, unlimited issues, $20/mo LLM budget per seat.",
        "pro",
    )
    pro_price = find_or_create_price(pro_prod.id, 2000, "pro-monthly")

    # Team plan - base + metered usage
    print("\nTeam plan:")
    team_prod = find_or_create_product(
        "Bumblebee Team",
        "Team plan with LLM-cost passthrough - unlimited workspaces + issues.",
        "team",
    )
    team_base = find_or_create_price(team_prod.id, 10000, "team-monthly")
    team_usage = find_or_create_price(
        team_prod.id, 0, "team-usage",
        usage_type="metered", aggregate_usage="sum",
    )

    print("\n---")
    print("Add these to .env:")
    print(f"STRIPE_PRICE_PRO_ID={pro_price.id}")
    print(f"STRIPE_PRICE_TEAM_ID={team_base.id}")
    print(f"STRIPE_PRICE_TEAM_USAGE_ID={team_usage.id}")
    print("---\n")


if __name__ == "__main__":
    main()
