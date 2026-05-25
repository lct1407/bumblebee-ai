"""Validate Issue.custom_fields against the FieldSchema for its type."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.field_schema import FieldSchema
from bumblebee.models.issue import Issue, IssueType


class FieldValidationError(Exception):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)


async def _load_schema(
    db: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID | None,
    issue_type: IssueType,
) -> dict | None:
    """Project-specific schema wins; falls back to workspace-wide (project_id NULL)."""
    if project_id:
        row = (
            await db.execute(
                select(FieldSchema).where(
                    FieldSchema.workspace_id == workspace_id,
                    FieldSchema.project_id == project_id,
                    FieldSchema.issue_type == issue_type,
                )
            )
        ).scalar_one_or_none()
        if row:
            return row.schema
    row = (
        await db.execute(
            select(FieldSchema).where(
                FieldSchema.workspace_id == workspace_id,
                FieldSchema.project_id.is_(None),
                FieldSchema.issue_type == issue_type,
            )
        )
    ).scalar_one_or_none()
    return row.schema if row else None


def _validate_one(field_def: dict, value) -> list[str]:
    """Return errors for a single field value (empty if OK)."""
    errs: list[str] = []
    key = field_def["key"]
    typ = field_def.get("type", "string")
    if value is None:
        if field_def.get("required"):
            errs.append(f"{key}: required")
        return errs

    if typ == "enum":
        opts = field_def.get("options", [])
        if value not in opts:
            errs.append(f"{key}: must be one of {opts}, got {value!r}")
    elif typ == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            errs.append(f"{key}: must be integer")
        else:
            if "min" in field_def and value < field_def["min"]:
                errs.append(f"{key}: must be >= {field_def['min']}")
            if "max" in field_def and value > field_def["max"]:
                errs.append(f"{key}: must be <= {field_def['max']}")
    elif typ in ("string", "text"):
        if not isinstance(value, str):
            errs.append(f"{key}: must be string")
        else:
            if "max_length" in field_def and len(value) > field_def["max_length"]:
                errs.append(f"{key}: exceeds max_length {field_def['max_length']}")
            pat = field_def.get("pattern")
            if pat and not re.search(pat, value):
                errs.append(f"{key}: does not match pattern {pat!r}")
    elif typ == "url":
        if not isinstance(value, str) or not value.startswith(("http://", "https://")):
            errs.append(f"{key}: must be a URL")
    elif typ == "boolean":
        if not isinstance(value, bool):
            errs.append(f"{key}: must be boolean")
    return errs


async def validate_custom_fields(
    db: AsyncSession, issue: Issue, values: dict | None = None,
) -> ValidationResult:
    """Validate values against the field schema for this issue's type+project.

    `values` defaults to `issue.custom_fields`. Missing schema = OK (free-form).
    Unknown keys are ignored (forward-compat).
    """
    schema = await _load_schema(
        db, issue.workspace_id, issue.project_id, issue.type
    )
    if not schema:
        return ValidationResult(ok=True)

    fields = schema.get("fields", [])
    field_map = {f["key"]: f for f in fields}
    values = values if values is not None else (issue.custom_fields or {})

    errors: list[str] = []
    # Validate required fields even if missing from values
    for f in fields:
        if f.get("required"):
            if f["key"] not in values:
                errors.append(f"{f['key']}: required")
                continue
    for k, v in (values or {}).items():
        fd = field_map.get(k)
        if not fd:
            continue  # unknown key — silently ignore
        errors.extend(_validate_one(fd, v))

    return ValidationResult(ok=not errors, errors=errors)
