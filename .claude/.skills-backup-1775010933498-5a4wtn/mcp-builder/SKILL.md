---
name: mcp-builder
description: |
  Guide for building and extending MCP tools in the Bumblebee FastAPI backend.
  Use when adding new MCP tools, improving existing ones, or integrating new
  data domains into the /mcp endpoint. Python/FastMCP stack.
version: 1.0.0
---

# MCP Tool Development Guide

MCP server: `api/src/mcp/server.py`, mounted at `/mcp` in `api/src/main.py`.

## Existing Tools

| Tool | Actions | Purpose |
|------|---------|---------|
| `bumblebee_work_items` | list, get, create, update | Work items (epic/story/task/bug/feature/chore/spike) |
| `bumblebee_comments` | list, create | Comments (discussion/proposal/review/agent_output) |
| `bumblebee_sprints` | list, get, create, update | Sprint management per project |
| `bumblebee_agent_sessions` | start, list, get, send | Agent chat session lifecycle |
| `TodoWrite` | (single) | Progress checklist reporting |

---

## Phase 1: Research and Plan

### Agent-Centric Design Principles

**Build for workflows, not endpoints.** Combine related operations into one tool
with an `action` parameter (like `bumblebee_work_items`) rather than separate tools.

**Optimize for limited context.** `list` returns compact summaries (id, key, title,
status). `get` returns full detail. Follow this pattern.

**Actionable error messages.** Errors must guide the agent:
```python
# Bad
return json.dumps({"error": "invalid"})
# Good
return json.dumps({"error": "project_slug required for list action"})
```

**Naming convention.** Prefix tools with `bumblebee_`. Group operations via `action`.

### Before You Start

Read these files:
- `api/src/mcp/server.py` -- Current tool definitions
- `api/src/main.py` -- MCP mount (`app.mount("/mcp", mcp.streamable_http_app())`)
- `api/src/models/` -- SQLAlchemy models
- `api/src/routers/` -- REST routers (for reference, not import)

### Plan the Tool

1. **Name**: `bumblebee_<domain>`
2. **Actions**: Only what an agent actually needs
3. **Parameters**: Flat strings; `data` as JSON string for complex input
4. **Responses**: Compact for list, detailed for get
5. **Errors**: Missing params, not found, unknown action

---

## Phase 2: Implement

### Step-by-Step: Adding a New MCP Tool

**Step 1 -- Define the tool in `api/src/mcp/server.py`:**

```python
@mcp.tool()
async def bumblebee_labels(
    action: str,
    project_slug: str | None = None,
    label_id: str | None = None,
    data: str | None = None,
) -> str:
    """CRUD for project labels. Actions: list, get, create, update.
    - list: requires project_slug
    - get: requires label_id
    - create: requires project_slug and data (JSON with name, color, description)
    - update: requires label_id and data (JSON with fields to update)
    """
```

**Step 2 -- Implement handler with async SQLAlchemy:**

```python
async with async_session() as db:
    if action == "list":
        if not project_slug:
            return json.dumps({"error": "project_slug required for list action"})
        proj = await db.execute(select(Project).where(Project.slug == project_slug))
        project = proj.scalar_one_or_none()
        if not project:
            return json.dumps({"error": f"Project '{project_slug}' not found"})
        result = await db.execute(select(Label).where(Label.project_id == project.id))
        labels = result.scalars().all()
        return json.dumps([{"id": l.id, "name": l.name, "color": l.color} for l in labels])
```

**Step 3 -- Add model import** at the top of `server.py`:
```python
from ..models.label import Label
```

**Step 4 -- Fallback** at end of function:
```python
return json.dumps({"error": f"Unknown action: {action}"})
```

**Step 5 -- Test** with Claude Code against running API server.

### Implementation Rules

- All I/O must be `async`/`await`
- Use `async_session()` from `..database` (one session per invocation)
- Return `str` via `json.dumps()` -- never raise exceptions
- Accept `data` as JSON string, parse with `json.loads(data)` inside handler
- Create `WorkItemEvent` records for mutations (see existing create/update patterns)
- Soft delete only: set `deleted_at`, filter with `.where(Model.deleted_at.is_(None))`
- No REST imports: query database directly using models

### Tool Annotations

For read-only tools, add `@mcp.tool(annotations={"readOnlyHint": True})`.
Other hints: `destructiveHint`, `idempotentHint`, `openWorldHint`.
Omit annotations for CRUD tools with mixed reads/writes.

### Docstring Format

```
"""One-line summary. Actions: list, get, create, update.
- list: requires X. Optional filters in data JSON: field1, field2
- get: requires Y
- create: requires X and data (JSON with field1, field2)
- update: requires Y and data (JSON with fields to update)
"""
```

---

## Phase 3: Review

### Quality Checklist

```
[ ] Tool name follows bumblebee_<domain> convention
[ ] Docstring lists all actions with required/optional params
[ ] Every action validates required parameters before querying
[ ] Not-found cases return {"error": "..."} with guidance
[ ] Unknown action falls through to {"error": f"Unknown action: {action}"}
[ ] List returns compact objects; Get returns full objects
[ ] Create/Update record WorkItemEvent (if applicable)
[ ] All queries filter deleted_at.is_(None) where applicable
[ ] Model import added to top of server.py
[ ] No REST router imports -- direct database access only
[ ] All database calls use await
[ ] data parameter parsed with json.loads() inside handler
[ ] Tool tested via Claude Code against running API
[ ] No sensitive data exposed (passwords, tokens)
```

---

## Phase 4: Evaluate

1. Start API: `cd api && uvicorn src.main:app --reload`
2. Connect Claude Code to `http://localhost:8000/mcp`
3. Test each action, error paths (missing params, invalid IDs, unknown actions),
   and multi-tool workflows (e.g., list items, get details, add comment)

---

## Architecture Reference

```
api/src/
  main.py               # app.mount("/mcp", mcp.streamable_http_app())
  mcp/server.py          # All MCP tool definitions (FastMCP instance)
  models/                # SQLAlchemy 2.0 async models
    work_item.py         #   WorkItem, WorkItemEvent
    comment.py           #   Comment
    sprint.py            #   Sprint
    project.py           #   Project
    agent_session.py     #   AgentSession
  database.py            # async_session() factory
  routers/               # REST endpoints (do NOT import in MCP tools)
```

## Key Imports

```python
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select, func as sa_func
from ..database import async_session
from ..models.<module> import <Model>
```
