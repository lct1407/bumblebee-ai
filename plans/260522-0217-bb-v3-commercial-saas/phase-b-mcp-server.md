# Phase B — MCP Server (multi-tenant)

## Context

- Plan: [plan.md](plan.md)
- Depends on: Phase A (workspace_id scope)
- MCP reference: https://modelcontextprotocol.io/spec
- Anthropic Claude Code MCP integration: https://docs.claude.com/claude-code/mcp

## Overview

| | |
|---|---|
| Priority | 🔴 Critical — Anthropic ecosystem distribution |
| Status | pending |
| Weeks | 4-5 |
| Brief | Bumblebee becomes a tool other agents use. Expose `list_issues / create_issue / trigger_workflow / get_events / get_runs` via MCP over Streamable HTTP + stdio. Auth via Bumblebee API key scoped to a workspace. |

## Key Insights

- Two transports needed: **Streamable HTTP** (default 2026, used by Claude Code SaaS + ChatGPT) and **stdio** (Claude Desktop local).
- MCP server is a separate sub-package `bumblebee-mcp` (or sub-module) so it can be installed/deployed independently.
- Auth = Bumblebee API key from Phase A header `X-BB-API-Key`. Key is scoped to a workspace; tools operate only within that scope.
- Tools should return ToolResult shaped per ECC (Phase C will tighten the schema; Phase B uses MCP's `content` array directly).

## Requirements

### Functional
- `bb mcp serve --transport http --port 8080` starts Streamable HTTP server
- `bb mcp serve --transport stdio` starts stdio (for Claude Desktop config)
- 5 tools exposed:
  - `list_issues(status?, type?, limit?)` → JSON array
  - `create_issue(title, type, priority?, description?)` → Issue JSON
  - `trigger_workflow(issue_id, workflow_name?)` → run_id
  - `get_events(issue_id?, limit?)` → events JSON
  - `get_runs(issue_id?)` → runs JSON
- Server reads API key from MCP `Authorization` header or env var `BUMBLEBEE_API_KEY`
- API key resolves to a workspace + role → permission-checks every tool call
- Tool result includes a `_meta` field with workspace name, role, latency

### Non-functional
- Streamable HTTP handles >100 concurrent client connections
- Cold-start < 500ms (no DB connection until first tool call)
- All 5 tools have JSON schema declared per MCP spec
- Errors return MCP-shaped error responses (not raw 500s)

## Architecture

```
┌──────────────────────────┐         ┌─────────────────────────┐
│ Claude Code / Desktop /   │  HTTP   │ bumblebee-mcp           │
│ Cursor                    │ ──────► │  - validates API key    │
│                           │         │  - resolves workspace   │
│                           │         │  - dispatches to tool   │
└──────────────────────────┘         └────────────┬────────────┘
                                                  │ (in-process)
                                                  ▼
                                  ┌─────────────────────────────┐
                                  │ Bumblebee API services      │
                                  │  (same db session, RBAC,    │
                                  │   queue, harness, etc.)     │
                                  └─────────────────────────────┘
```

## Related Code Files

### Create
- `bumblebee_mcp/__init__.py`
- `bumblebee_mcp/server.py` — MCP server using `mcp` Python SDK
- `bumblebee_mcp/tools/list_issues.py`
- `bumblebee_mcp/tools/create_issue.py`
- `bumblebee_mcp/tools/trigger_workflow.py`
- `bumblebee_mcp/tools/get_events.py`
- `bumblebee_mcp/tools/get_runs.py`
- `bumblebee_mcp/auth.py` — API key resolution → workspace + role
- `bumblebee_mcp/cli.py` — `bb mcp serve` Typer command
- `docs/mcp-integration.md` — Claude Code/Desktop setup guide
- `docs/mcp-tools-reference.md` — JSON schema per tool

### Modify
- `pyproject.toml` — add `mcp` dependency, register `bumblebee_mcp.cli:app` as additional console script
- `bumblebee/cli.py` — add `bb mcp` subcommand pointing to mcp app

## Implementation Steps

1. **Spike MCP SDK** — install `mcp` Python SDK; build hello-world server with one tool (`echo`); test from Claude Code locally.
2. **Define tool JSON schemas** — write 5 schemas in `bumblebee_mcp/tools/_schemas.py`. Each has name, description, inputSchema (JSON Schema), outputSchema.
3. **Auth module** — `resolve_api_key(key: str) → (workspace_id, user_id, role)`. Hits the same `api_keys` table as REST.
4. **Tool implementations** — each calls into existing service layer (NOT through HTTP). Uses an async SQLAlchemy session. Returns dict.
5. **Permission gate** — each tool declares required `Permission`. `auth.check_permission(role, perm)` before dispatch.
6. **Server bootstrap** — `bumblebee_mcp.server.create_server() → mcp.Server` that registers tools.
7. **Transport: stdio** — `bb mcp serve --transport stdio` uses MCP SDK's stdio runner. Reads API key from `BUMBLEBEE_API_KEY` env.
8. **Transport: Streamable HTTP** — FastAPI subapp mounted at `/mcp` OR standalone Uvicorn process. Validates `Authorization: Bearer <api_key>` header per request.
9. **Error mapping** — RBAC denial → MCP error code `permission_denied`. Not-found → `resource_not_found`. Validation → `invalid_params`.
10. **Logging + audit** — each tool call appends a `mcp_tool_called` event to the issue's event log if `issue_id` is in params. Visible in Activity tab.
11. **CLI command** — `bb mcp serve --transport [http|stdio] [--port N] [--workspace SLUG]`.
12. **Claude Code config** — provide JSON snippet for `~/.claude/mcp_servers.json` in docs.
13. **Claude Desktop config** — provide JSON for `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS path).
14. **Tests** — pytest: each tool returns valid MCP response, permission denial works, API key resolution works, schema valid against MCP spec.
15. **Integration test** — spawn server in subprocess, MCP client SDK exercises all 5 tools.

## Todo

- [ ] MCP SDK installed + hello-world tool verified in Claude Code
- [ ] 5 tool schemas written
- [ ] Auth module resolves API key → workspace + role
- [ ] Permission gate per tool
- [ ] stdio transport works
- [ ] Streamable HTTP transport works
- [ ] Error mapping to MCP shapes
- [ ] `mcp_tool_called` event emitted per call (auditable)
- [ ] `bb mcp serve` CLI works with both transports
- [ ] `docs/mcp-integration.md` covers Claude Code + Desktop setup
- [ ] 5 tool reference docs written
- [ ] Pytest coverage ≥80% on auth + each tool
- [ ] Integration test passes end-to-end

## Success Criteria

- ✅ `bb mcp serve --transport stdio` works when configured into Claude Desktop
- ✅ Claude Code can use Bumblebee as a tool catalog (lists, creates, triggers issues)
- ✅ Cross-workspace API key cannot access another workspace's issues
- ✅ Tool latency p99 < 800ms for read tools, < 2s for create/trigger
- ✅ All 5 tools return MCP-spec-valid responses
- ✅ Audit trail of every MCP tool call available in Activity tab

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MCP SDK API changes mid-build | High | Med | Pin to specific version (`mcp==X.Y.Z`); update only in dedicated bump |
| Streamable HTTP impl differs from stdio | Med | Low | SDK abstracts transport; test both with same tool set |
| API key leak via Claude Code logs | Med | High | Document "use a dedicated MCP-scoped API key, never your main one"; future: token rotation |
| Tool result too large (e.g. 1000 events) | Med | Med | Enforce server-side limits (max 100 per call), pagination cursors |
| Permission gate forgotten on new tool | Low | High | Mandatory `required_permission` field in tool registration; test asserts all tools have it |

## Security Considerations

- API key transmitted in `Authorization: Bearer` header — MUST be HTTPS in production. stdio is local so OK.
- Tool inputs validated against declared JSON schema before dispatch.
- Tool outputs truncated to prevent log/UI overload (max 32KB per response body).
- Rate limit per API key: 100 req/min default, configurable per workspace.
- API key rotation: workspace owner can revoke + reissue.

## Next Steps

- **Depends on**: Phase A (workspace scope, API key model)
- **Blocks**: nothing strict, but Phase C (ECC ToolResult schema) will tighten this layer
- **Unlocks**: Anthropic-ecosystem distribution. Bumblebee can be advertised in MCP server catalogs.
