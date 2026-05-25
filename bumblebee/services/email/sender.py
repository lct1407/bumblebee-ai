"""Transactional email sender — BB-8.

Minimal abstraction over an HTTP provider (Resend by default). Falls back to
logging-only in dev when RESEND_API_KEY is unset.

Usage:
    await send_email(to=..., subject=..., text=..., html=None)
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import httpx

log = logging.getLogger(__name__)


@dataclass
class EmailResult:
    sent: bool
    provider: str
    message_id: str | None = None
    error: str | None = None


async def send_email(
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
    from_addr: str | None = None,
) -> EmailResult:
    """Send a single transactional email."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = from_addr or os.environ.get("EMAIL_FROM", "noreply@bumblebee.dev")

    if not api_key:
        log.info("[email-dryrun] to=%s subject=%r text=%s", to, subject, text[:120])
        return EmailResult(sent=False, provider="dryrun", error="no RESEND_API_KEY")

    body = {"from": sender, "to": [to], "subject": subject, "text": text}
    if html:
        body["html"] = html

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.resend.com/emails",
                json=body,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            r.raise_for_status()
            data = r.json()
            return EmailResult(sent=True, provider="resend", message_id=data.get("id"))
    except Exception as e:
        log.warning("email send failed: %s", e)
        return EmailResult(sent=False, provider="resend", error=str(e)[:300])


# Convenience templates ------------------------------------------------------


async def send_welcome(to: str, username: str) -> EmailResult:
    return await send_email(
        to=to,
        subject="Welcome to Bumblebee 🐝",
        text=(
            f"Hi {username},\n\n"
            "Welcome to Bumblebee. Get started by:\n"
            "1. Creating a project (link your repo).\n"
            "2. Pairing your device for local AI execution.\n"
            "3. Creating your first issue.\n\n"
            "See https://bumblebee.dev/help for the full guide.\n\n"
            "— The Bumblebee team"
        ),
    )


async def send_password_reset(to: str, reset_url: str) -> EmailResult:
    return await send_email(
        to=to, subject="Reset your Bumblebee password",
        text=f"Click this link to reset your password:\n\n{reset_url}\n\nExpires in 1 hour.",
    )


async def send_invoice_receipt(to: str, amount: str, period: str) -> EmailResult:
    return await send_email(
        to=to, subject=f"Bumblebee invoice — {period}",
        text=f"Your invoice for {period} of {amount} has been paid. Thanks!",
    )
