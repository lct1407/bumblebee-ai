"""Gemini-backed MCP tools — Harness-spec compliant (ToolResult shape).

Two new tools added to the catalog:

  bumblebee_smart_create_issue
    Natural-language → structured issue draft. The user types
    "fix login flow that 500s on Google OAuth" and Gemini decomposes it into
    title / type / priority / description (with the right sectioned markdown)
    BEFORE the actual issue is created. Returns a ToolResult that the calling
    agent can confirm + commit via bumblebee_create_issue, or amend.

  bumblebee_ask
    Workspace Q&A. The user asks "what's the status of OAuth work?" — we
    retrieve the relevant issues + recent events, feed them to Gemini as
    context, get a grounded answer back. ToolResult.summary contains the
    answer text; ToolResult.artifacts lists the source issue IDs.

Both:
- Use the GeminiProvider (BUMBLEBEE_PROVIDER agnostic — Gemini is always used
  for these "smart" tools because they need different cost/latency tradeoffs
  than the workflow-running LLM)
- RBAC-gated per the Permission enum
- Workspace-scoped at the SQL layer
- Wrap output in ToolResult shape for downstream MCP / harness consumption
"""
from __future__ import annotations
import json
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from bumblebee.models.event import Event
from bumblebee.models.issue import Issue, IssuePriority, IssueStatus, IssueType
from bumblebee.services.execution.context_assembler import Prompt
from bumblebee.services.execution.llm_provider import GeminiProvider
from bumblebee.services.rbac.permissions import Permission
from bumblebee.services.tool.result import ToolResult
from bumblebee_mcp.auth import McpAuthContext
from bumblebee_mcp.tools import McpTool

log = logging.getLogger(__name__)


def _result(tr: ToolResult) -> dict:
    """Serialize ToolResult (Pydantic model) to a JSON-safe dict."""
    return tr.model_dump(mode="json")


# Helpers for issue serialization (mirror bumblebee_mcp.tools._issue_to_dict)
def _issue_summary(i: Issue) -> dict:
    return {
        "id": str(i.id),
        "number": i.number,
        "title": i.title,
        "status": i.status.value if hasattr(i.status, "value") else str(i.status),
        "priority": i.priority.value if hasattr(i.priority, "value") else str(i.priority),
        "type": i.type.value if hasattr(i.type, "value") else str(i.type),
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


# ---------- smart_create_issue ----------

SMART_DRAFT_SYSTEM = """You are an issue-drafting assistant for Bumblebee, a multi-agent task
management platform. The user describes work in natural language. You must
respond with ONLY a JSON object (no markdown fence, no commentary) shaped:

{
  "title": "<short, imperative-mood title, < 80 chars>",
  "type": "bug|feature|task|story|chore|spike",
  "priority": "critical|high|medium|low|none",
  "description": "<markdown body with sections>",
  "scope_hints": ["<file/path globs>", ...],
  "rationale": "<one-line why this type+priority>"
}

The description MUST use these section headers (skip ones that don't apply):
  ## Overview
  ## Acceptance criteria       (with - [ ] checklist items)
  ## Reproduction steps        (bugs only — numbered)
  ## Expected behavior          (bugs only)
  ## Actual behavior            (bugs only)
  ## Environment                (bugs only)
  ## Root cause                 (omit on create — filled by triage)

Heuristics:
- "fix" / "broken" / "crashes" / "regression" → type=bug, priority=high
- "add" / "implement" / "support" → type=feature, priority=medium
- security / data loss / outage → priority=critical
- typo / docs / minor polish → priority=low
- scope_hints: derive from any file paths the user mentions, else infer module
"""


async def smart_create_issue(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """Draft a structured issue from natural language. Does NOT persist."""
    user_text = args.get("prompt") or args.get("description") or ""
    if not user_text.strip():
        return _result(ToolResult.err("missing 'prompt' argument"))

    prompt = Prompt(system=SMART_DRAFT_SYSTEM, user=user_text.strip())
    resp = await GeminiProvider().invoke(prompt, max_tokens=2000)

    if resp.finish_reason == "error":
        return _result(ToolResult.err(f"Gemini call failed: {resp.text[:200]}"))

    # Tolerant JSON parse — strip optional markdown fence
    raw = resp.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        draft = json.loads(raw)
    except json.JSONDecodeError as e:
        return _result(ToolResult.err(
            f"Gemini returned non-JSON: {e}",
            next_actions=["retry with a simpler prompt"],
        ))

    # Normalize enum values
    type_ok = draft.get("type") in {t.value for t in IssueType}
    pri_ok = draft.get("priority") in {p.value for p in IssuePriority}
    if not type_ok:
        draft["type"] = "task"
    if not pri_ok:
        draft["priority"] = "medium"

    # Optional auto-create flag — when true AND user has WRITE_ISSUE, persist immediately
    if args.get("commit") is True:
        from bumblebee.services.rbac.permissions import has_permission
        if not has_permission(ctx.role, Permission.WRITE_ISSUE):
            return _result(ToolResult.warn(
                "Draft ready but you lack write_issue permission to commit",
                data=draft,
            ))
        # Create via existing tools module to avoid duplicating logic
        from bumblebee_mcp.tools import create_issue as _create
        created = await _create(db, ctx, {
            "title": draft["title"],
            "description": draft["description"],
            "type": draft["type"],
            "priority": draft["priority"],
            "scope_hints": draft.get("scope_hints", []),
        })
        return _result(ToolResult.ok(
            f"Created issue: {created['title']}",
            artifacts=[created["id"]],
            data={"draft": draft, "issue": created},
            next_actions=[f"View issue {created['number']}"],
        ))

    # Default: just return the draft for user/agent confirmation
    return _result(ToolResult.ok(
        f"Drafted: {draft['title']} ({draft['type']}/{draft['priority']})",
        data=draft,
        next_actions=[
            "Review the draft, then call bumblebee_smart_create_issue again with commit=true to persist",
            "Or call bumblebee_create_issue directly to skip the draft step",
        ],
    ))


# ---------- ask_workspace ----------

ASK_SYSTEM = """You are a Q&A assistant for a Bumblebee workspace. The user
asks a question. You will be given:
  - The user's question
  - A JSON list of relevant issues (with number, title, status, priority, type)
  - A JSON list of recent events (with type, payload, occurred_at)

Answer concisely (under 200 words). Cite issue numbers as BB-{number} where
relevant. If the question can't be answered from the data, say so directly —
do not invent facts.

End your answer with a "Sources:" line listing the issue numbers you cited."""


async def ask_workspace(db: AsyncSession, ctx: McpAuthContext, args: dict) -> dict:
    """Answer a question about the workspace using retrieved context."""
    question = (args.get("question") or "").strip()
    if not question:
        return _result(ToolResult.err("missing 'question' argument"))

    # Retrieve top 30 issues + 30 most-recent events as grounding context
    issues_rows = (
        await db.execute(
            select(Issue)
            .where(Issue.workspace_id == ctx.workspace_id)
            .order_by(desc(Issue.updated_at))
            .limit(30)
        )
    ).scalars().all()

    events_rows = (
        await db.execute(
            select(Event)
            .where(Event.workspace_id == ctx.workspace_id)
            .order_by(desc(Event.occurred_at))
            .limit(30)
        )
    ).scalars().all()

    issues_ctx = [_issue_summary(i) for i in issues_rows]
    events_ctx = [
        {
            "type": e.type,
            "actor": e.actor,
            "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
            "payload": {
                k: v for k, v in (e.payload or {}).items()
                if k in ("from", "to", "field", "cost_usd", "model", "decision", "error")
            },
            "issue_id": str(e.issue_id) if e.issue_id else None,
        }
        for e in events_rows
    ]

    user_msg = (
        f"Question: {question}\n\n"
        f"Issues ({len(issues_ctx)}):\n{json.dumps(issues_ctx, default=str)[:8000]}\n\n"
        f"Recent events ({len(events_ctx)}):\n{json.dumps(events_ctx, default=str)[:6000]}"
    )
    prompt = Prompt(system=ASK_SYSTEM, user=user_msg)
    resp = await GeminiProvider().invoke(prompt, max_tokens=800)

    if resp.finish_reason == "error":
        return _result(ToolResult.err(f"Gemini call failed: {resp.text[:200]}"))

    return _result(ToolResult.ok(
        resp.text.strip(),
        data={
            "model": resp.model,
            "tokens_in": resp.tokens_in,
            "tokens_out": resp.tokens_out,
            "context_issues": len(issues_ctx),
            "context_events": len(events_ctx),
        },
        artifacts=[str(i.id) for i in issues_rows[:5]],
    ))


# ---------- Tool catalog ----------

GEMINI_TOOLS: list[McpTool] = [
    McpTool(
        name="bumblebee_smart_create_issue",
        description=(
            "Draft a structured issue from natural language using Gemini. "
            "Returns a draft (title/type/priority/description/scope_hints) without persisting. "
            "Pass commit=true to also create the issue immediately."
        ),
        input_schema={
            "type": "object",
            "required": ["prompt"],
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Natural-language description of the work (e.g. 'fix the bcrypt cost factor in auth — too low for 2026 hardware')",
                },
                "commit": {
                    "type": "boolean",
                    "default": False,
                    "description": "If true, also create the issue (requires write_issue permission)",
                },
            },
        },
        required_permission=Permission.READ_ISSUE,  # drafting alone needs only read
        handler=smart_create_issue,
    ),
    McpTool(
        name="bumblebee_ask",
        description=(
            "Ask a natural-language question about the workspace. "
            "Retrieves the top 30 issues + 30 recent events as context, runs them through Gemini, "
            "returns a grounded answer with issue citations."
        ),
        input_schema={
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Free-form question (e.g. 'what's the status of OAuth work?', 'how much did we spend on LLMs today?')",
                },
            },
        },
        required_permission=Permission.READ_ISSUE,
        handler=ask_workspace,
    ),
]


# Self-register into the core catalog. Done here (instead of in tools.py) to
# break the circular import between tools.py and gemini_tools.py.
def _register_into_catalog() -> None:
    import bumblebee_mcp.tools as _t
    existing_names = {tool.name for tool in _t.TOOLS}
    for tool in GEMINI_TOOLS:
        if tool.name not in existing_names:
            _t.TOOLS.append(tool)
            _t.TOOLS_BY_NAME[tool.name] = tool


_register_into_catalog()
