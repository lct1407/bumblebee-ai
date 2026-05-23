"""Thin Stripe SDK wrapper with idempotency + configuration gate.

Phase A: no live Stripe calls yet — `is_configured()` returns False until
`STRIPE_SECRET_KEY` is set in .env.
Phase D: replace get_stripe() callers with real Checkout/Subscription flows.
"""
from __future__ import annotations
import logging
import uuid

import stripe

from bumblebee.config import get_settings

log = logging.getLogger(__name__)


class StripeNotConfigured(Exception):
    """Raised when billing code is invoked but STRIPE_SECRET_KEY is unset.

    Use `is_configured()` to gate Stripe calls during phased rollout.
    """


def is_configured() -> bool:
    """True when the Stripe SDK has a usable secret key."""
    s = get_settings()
    return bool(s.stripe_secret_key) and s.billing_enabled


def get_stripe() -> stripe:
    """Return the Stripe SDK module configured with our secret key.

    Raises StripeNotConfigured if billing is disabled.
    """
    if not is_configured():
        raise StripeNotConfigured(
            "STRIPE_SECRET_KEY missing or BILLING_ENABLED=false. "
            "Set both in .env to enable live billing."
        )
    s = get_settings()
    stripe.api_key = s.stripe_secret_key
    stripe.api_version = "2024-12-18.acacia"  # pin to known API version
    return stripe


def new_idempotency_key(prefix: str = "bb") -> str:
    """Generate a request-unique idempotency key for safe Stripe retries."""
    return f"{prefix}-{uuid.uuid4().hex}"
