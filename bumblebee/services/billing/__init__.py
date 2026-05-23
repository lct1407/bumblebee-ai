"""Billing service — Stripe SDK wrapper + catalog + quota.

Phase A scaffolds (SDK install + columns + webhook skeleton).
Phase D activates (Checkout, subscriptions, quota enforcement, usage passthrough).
"""
from bumblebee.services.billing.stripe_client import (
    StripeNotConfigured,
    get_stripe,
    is_configured,
)

__all__ = ["StripeNotConfigured", "get_stripe", "is_configured"]
