# MCP Server Integration Guide

How to wire Bumblebee into Claude Code, Claude Desktop, Cursor, and other MCP-aware clients.

## What is this?

The Bumblebee MCP server exposes 5 tools to external AI agents:

| Tool | Permission needed | Description |
|---|---|---|
| `bumblebee_list_issues` | `read_issue` | Paginated list with status/type/priority filters |
| `bumblebee_get_issue` | `read_issue` | Single issue by per-project number |
| `bumblebee_create_issue` | `write_issue` | File a new issue (defaults to first project) |
| `bumblebee_trigger_workflow` | `trigger_workflow` | Run triage→analyze→implement→test on an issue |
| `bumblebee_get_events` | `read_issue` | Read event log (workspace-scoped or per-issue) |

Other agents (Claude Code, Cursor, etc.) can now use Bumblebee as a backend for filing and tracking issues during their work.

## Auth model

- One Bumblebee **API key** per MCP client session
- Key is workspace-scoped via the user it was issued for (the user's primary workspace)
- Permission gate runs per tool call — viewer can read but can't create issues, etc.
- Cross-workspace access returns `permission_denied` (never 404 — no existence leak)

Issue an API key in the Bumblebee UI: `/settings/api-keys` (Phase B-final TODO; for now use `POST /api/auth/api-keys`).

## Transports

| Transport | When to use |
|---|---|
| **stdio** | Claude Desktop, local Cursor — process is launched on-demand by the client |
| **Streamable HTTP** (`/mcp/call` POST) | Claude Code SaaS, web agents, anywhere the client opens a long-lived HTTP connection |

## Setup — Claude Desktop (stdio)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bumblebee": {
      "command": "bb",
      "args": ["mcp", "serve", "--transport", "stdio"],
      "env": {
        "BUMBLEBEE_API_KEY": "bb_yourkeyhere",
        "DATABASE_URL": "postgresql+asyncpg://bumblebee:bumblebee@localhost:5433/bumblebee"
      }
    }
  }
}
```

Restart Claude Desktop. The five tools appear in the tool catalog with the `bumblebee_` prefix.

## Setup — Claude Code / Cursor (HTTP)

1. Start the server:
   ```bash
   bb mcp serve --transport http --port 8080
   ```

2. Configure your client (Claude Code) to point at:
   ```
   POST http://localhost:8080/mcp/call
   Authorization: Bearer bb_yourkeyhere
   ```

3. Test the wire:
   ```bash
   curl -s http://localhost:8080/mcp/tools | jq
   curl -s -X POST http://localhost:8080/mcp/call \
        -H "Authorization: Bearer $BUMBLEBEE_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"name":"bumblebee_list_issues","arguments":{"limit":5}}'
   ```

For production deployment, put the MCP HTTP server behind a TLS terminator (Caddy/nginx) and configure clients to use `https://mcp.bumblebee.example.com`.

## Tool examples

### List recent bugs

```json
{
  "name": "bumblebee_list_issues",
  "arguments": {"type": "bug", "status": "new", "limit": 20}
}
```

### Create an issue from another agent

```json
{
  "name": "bumblebee_create_issue",
  "arguments": {
    "title": "Add rate limit on /api/auth/login",
    "type": "feature",
    "priority": "high",
    "description": "## Overview\nProtect against credential stuffing.\n\n## Acceptance criteria\n- [ ] 10 req/min per IP\n- [ ] 429 + Retry-After",
    "scope_hints": ["bumblebee/routers/auth.py", "bumblebee/services/rate_limit/**"]
  }
}
```

### Trigger autonomous workflow

```json
{
  "name": "bumblebee_trigger_workflow",
  "arguments": {"issue_number": 7}
}
```

Returns `{ "workflow_run_id": "...", "status": "running" }`. Use `bumblebee_get_events` to poll progress.

## Files (codebase reference)

| Path | Role |
|---|---|
| `bumblebee_mcp/__init__.py` | Package marker, version |
| `bumblebee_mcp/auth.py` | API key → (workspace, user, role) resolution |
| `bumblebee_mcp/tools.py` | Tool catalog + JSON schemas + handlers |
| `bumblebee_mcp/server.py` | MCP `Server` factory (shared by both transports) |
| `bumblebee_mcp/http_server.py` | FastAPI app for Streamable HTTP transport |
| `bumblebee_mcp/cli.py` | `bb mcp serve` Typer command |

## Security considerations

- **API keys** are sent in `Authorization: Bearer` headers — HTTPS in production
- Tool inputs validated against declared JSON schema before dispatch
- Tool outputs serialized via `default=str` — UUIDs become strings safely
- All tool calls are workspace-scoped at the SQL layer (`WHERE workspace_id = ctx.workspace_id`)
- Permission denied returns a structured error, never a stack trace
- Rate limiting: 100 req/min per API key (TODO Phase B-final — currently uncapped)

## What's missing in v1 (Phase B-final / future)

- Pagination cursors (we use simple `limit` + descending by number/time)
- Tool result truncation when result > 32KB
- API key rotation UI
- Per-key scope picker (so a key can be workspace-scoped, not user-primary-workspace-scoped)
- Tool-call audit events (`mcp_tool_called` events on every dispatch)
- Workspace-pinned API keys with limited permission subset
