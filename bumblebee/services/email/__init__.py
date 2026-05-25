"""Transactional email — BB-8."""
from bumblebee.services.email.sender import (
    EmailResult,
    send_email,
    send_invoice_receipt,
    send_password_reset,
    send_welcome,
)

__all__ = [
    "EmailResult",
    "send_email",
    "send_invoice_receipt",
    "send_password_reset",
    "send_welcome",
]
