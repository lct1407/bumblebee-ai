"""Transactional email — BB-8."""
from bumblebee.services.email.sender import (
    send_email, send_welcome, send_password_reset, send_invoice_receipt, EmailResult,
)

__all__ = ["send_email", "send_welcome", "send_password_reset",
           "send_invoice_receipt", "EmailResult"]
