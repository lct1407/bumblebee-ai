"""ToolRegistry: versioned single-verb tool defs with strict schemas. Plane 6."""
from typing import Any, Callable
from pydantic import BaseModel, Field


class ToolDef(BaseModel):
    name: str
    description: str
    examples: list[dict] = Field(default_factory=list)
    schema: dict  # JSON schema for args
    roles: list[str] = Field(default_factory=list)  # roles allowed
    version: str = "1.0.0"


# Built-in tool catalog (Phase 1 minimum — expand in later phases)
TOOLS: dict[str, ToolDef] = {
    "list_issues": ToolDef(
        name="list_issues",
        description="List issues in a project. Filter by status, type, priority.",
        examples=[{"args": {"project_slug": "bb", "status": "new"}, "result": "[...]"}],
        schema={
            "type": "object",
            "properties": {
                "project_slug": {"type": "string"},
                "status": {"type": "string"},
                "type": {"type": "string"},
            },
            "required": ["project_slug"],
        },
        roles=["coordinator", "triager", "assistant"],
    ),
    "get_issue": ToolDef(
        name="get_issue",
        description="Fetch full issue detail by id or number.",
        examples=[{"args": {"issue_id": "uuid"}, "result": "{...}"}],
        schema={
            "type": "object",
            "properties": {"issue_id": {"type": "string"}},
            "required": ["issue_id"],
        },
        roles=["all"],
    ),
    "create_issue": ToolDef(
        name="create_issue",
        description="Create a new issue.",
        examples=[{"args": {"project_slug": "bb", "title": "fix login"}, "result": "{...}"}],
        schema={
            "type": "object",
            "properties": {
                "project_slug": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "type": {"type": "string"},
            },
            "required": ["project_slug", "title"],
        },
        roles=["coordinator", "assistant"],
    ),
    "suggest_issue": ToolDef(
        name="suggest_issue",
        description="Suggest an issue draft for user approval (HITL chat pattern).",
        examples=[{"args": {"draft": {"title": "...", "type": "bug"}}, "result": "{draft_id}"}],
        schema={
            "type": "object",
            "properties": {"draft": {"type": "object"}},
            "required": ["draft"],
        },
        roles=["assistant"],
    ),
    "acquire_scope_lease": ToolDef(
        name="acquire_scope_lease",
        description="Atomically claim file globs for exclusive access.",
        examples=[{"args": {"patterns": ["src/auth/**"]}, "result": "{lease_id}"}],
        schema={
            "type": "object",
            "properties": {"patterns": {"type": "array", "items": {"type": "string"}}},
            "required": ["patterns"],
        },
        roles=["implementer", "tester", "integrator"],
    ),
    "release_scope_lease": ToolDef(
        name="release_scope_lease",
        description="Release a previously-acquired scope lease.",
        examples=[{"args": {"lease_id": "uuid"}, "result": "ok"}],
        schema={"type": "object", "properties": {"lease_id": {"type": "string"}}, "required": ["lease_id"]},
        roles=["implementer", "tester", "integrator"],
    ),
    "add_knowledge": ToolDef(
        name="add_knowledge",
        description="Add a project knowledge entry (decision/convention/pitfall/fact).",
        examples=[{"args": {"category": "convention", "title": "...", "body": "..."}, "result": "{id}"}],
        schema={
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "scope_globs": {"type": "array"},
            },
            "required": ["category", "title", "body"],
        },
        roles=["all"],
    ),
    "query_knowledge": ToolDef(
        name="query_knowledge",
        description="Query project knowledge by category, tags, or scope.",
        examples=[{"args": {"category": "decision"}, "result": "[...]"}],
        schema={
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "scope_glob": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
        roles=["all"],
    ),
    "request_human_approval": ToolDef(
        name="request_human_approval",
        description="Pause and request human approval (HITL-as-tool, 12-factor #7).",
        examples=[{"args": {"context": "ready to deploy"}, "result": "approved | rejected"}],
        schema={
            "type": "object",
            "properties": {"context": {"type": "string"}, "options": {"type": "array"}},
            "required": ["context"],
        },
        roles=["coordinator", "reviewer"],
    ),
    "scratch_write": ToolDef(
        name="scratch_write",
        description="Persist working data to session scratchpad (Tier 3 memory).",
        examples=[{"args": {"key": "plan_progress", "value": {}}, "result": "ok"}],
        schema={
            "type": "object",
            "properties": {"key": {"type": "string"}, "value": {}},
            "required": ["key", "value"],
        },
        roles=["implementer", "integrator", "coordinator"],
    ),
    "scratch_read": ToolDef(
        name="scratch_read",
        description="Read from session scratchpad.",
        examples=[{"args": {"key": "plan_progress"}, "result": "{}"}],
        schema={"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]},
        roles=["implementer", "integrator", "coordinator"],
    ),
}


def tools_for_role(role: str) -> list[ToolDef]:
    """Return tools available to a role. 'all' role tag means visible to everyone."""
    return [t for t in TOOLS.values() if role in t.roles or "all" in t.roles]


def validate_tool_call(name: str, args: dict) -> tuple[bool, str | None]:
    """Validate a tool call against its schema. Returns (ok, error_msg)."""
    tool = TOOLS.get(name)
    if tool is None:
        return False, f"unknown_tool: {name}"
    # Basic required-field validation (full JSON schema can be added with jsonschema lib)
    required = tool.schema.get("required", [])
    for field in required:
        if field not in args:
            return False, f"missing_field: {field}"
    return True, None
