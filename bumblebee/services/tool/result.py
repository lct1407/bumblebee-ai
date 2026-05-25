"""ToolResult — observation schema adopted from ECC agent-harness-construction.

Improves agent recovery + reduces context bloat:
- status: success/warning/error
- summary: one-line result (goes into LLM context)
- next_actions: actionable follow-ups
- artifacts: file paths/IDs
- data: raw output (NOT in context unless explicitly fetched)
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolResult(BaseModel):
    status: Literal["success", "warning", "error"] = "success"
    summary: str = ""
    next_actions: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    data: dict | None = None

    @classmethod
    def ok(cls, summary: str, **kw: Any) -> ToolResult:
        return cls(status="success", summary=summary, **kw)

    @classmethod
    def warn(cls, summary: str, **kw: Any) -> ToolResult:
        return cls(status="warning", summary=summary, **kw)

    @classmethod
    def err(cls, summary: str, next_actions: list[str] | None = None) -> ToolResult:
        return cls(status="error", summary=summary, next_actions=next_actions or [])
