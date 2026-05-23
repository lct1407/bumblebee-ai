"""Sentry SDK init — BB-9.

Imported lazily from main.create_app(). Empty SENTRY_DSN disables.
"""
from __future__ import annotations
import logging

from bumblebee.config import get_settings

log = logging.getLogger(__name__)


def init_sentry() -> bool:
    """Initialize Sentry SDK if SENTRY_DSN is set. Returns True on success."""
    s = get_settings()
    dsn = (s.sentry_dsn or "").strip()
    if not dsn:
        log.debug("sentry disabled (no SENTRY_DSN)")
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.05,
            environment=s.environment,
            integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        )
        log.info("sentry initialized env=%s", s.environment)
        return True
    except Exception as e:
        log.warning("sentry init failed: %s", e)
        return False
