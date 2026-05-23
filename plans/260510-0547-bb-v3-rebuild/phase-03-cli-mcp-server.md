# Phase 03 — CLI + MCP Server (Same Go Binary)

## Context Links
- [plan.md](plan.md)
- [phase-02-workflow-executor-claude-cli.md](phase-02-workflow-executor-claude-cli.md)
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md) — pain 1 (dual CLI), pain 7 (MCP CRUD-only)

## Overview
- **Priority:** P1
- **Status:** pending
- **Week:** 3
- **Brief:** Same `bb` binary serves API, CLI subcommands, and MCP server (Streamable HTTP). MCP exposes orchestration not just CRUD.

## Key Insights
- Single binary kills the v2 dual-CLI drift problem.
- MCP must include `task_run` and `task_advance` tools — Claude Code can drive the loop without shelling out.
- CLI uses same `internal/tasks` service via local API call (default) or in-process import (fast path for tests).
- Cobra for CLI subcommand tree; small footprint.

## Requirements

### Functional
- `bb api` — runs HTTP server (Phase 01).
- `bb mcp` — runs MCP Streamable HTTP server on `:8081/mcp`.
- `bb task create <title> [--description] [--project SLUG]`
- `bb task list [--status] [--project] [--assignee]`
- `bb task show <id|number>`
- `bb task update <id|number> [--status] [--title] [--assignee]`
- `bb task run <id|number> --phase <phase>` — manually trigger phase
- `bb auth login` — saves JWT to `~/.bumblebee/credentials`
- MCP tools (5):
  - `task_list` (project, status filters)
  - `task_get` (id)
  - `task_create` (title, description, project)
  - `task_update` (id, status/title/assignee)
  - `task_run` (id, phase) — orchestration tool
- MCP streams runner events back to caller via Streamable HTTP (SSE-like).

### Non-Functional
- CLI startup <100ms.
- MCP tool definitions auto-generated from JSON schema (single source of truth).
- Auth: CLI uses stored JWT; MCP uses `X-BB-Token` header (JWT).

## Architecture

```
                         bb (single binary)
                              │
  ┌───────────┬───────────────┼────────────────┐
  │           │               │                │
 api         mcp             task...          auth...
 (HTTP)   (MCP server)      (CLI)           (login)
  │           │               │
  └─► internal/tasks/service ◄┘
            │
            └─► internal/workflow/executor (Phase 02)
```

CLI default mode: HTTP client against `bb api` server (so `bb` works on remote machines).
Override: `BB_LOCAL=1` runs service in-process (used by tests).

## Related Code Files (to create)

```
cmd/bb/main.go                       — Cobra root
cmd/bb/api.go                        — already exists, Phase 01
cmd/bb/mcp.go                        — `bb mcp` server
cmd/bb/task.go                       — `bb task ...` subcommands
cmd/bb/auth.go                       — `bb auth login`
internal/cli/client.go               — HTTP client wrapping API
internal/cli/credentials.go          — ~/.bumblebee/credentials read/write
internal/cli/printer.go              — table/JSON output
internal/mcp/server.go               — Streamable HTTP MCP impl
internal/mcp/tools/task_list.go      — tool def + handler
internal/mcp/tools/task_get.go
internal/mcp/tools/task_create.go
internal/mcp/tools/task_update.go
internal/mcp/tools/task_run.go       — streams runner events
internal/mcp/tools/registry.go
internal/mcp/types.go                — MCP request/response shapes
```

## MCP tool definitions (summary)

| Tool | Inputs | Output | Streams |
|---|---|---|---|
| task_list | project, status?, limit? | array of tasks | no |
| task_get | id | task object | no |
| task_create | title, description?, project | task object | no |
| task_update | id, status?, title?, assignee? | task object | no |
| task_run | id, phase | run id + final state | yes (events) |

## Implementation Steps

1. Add deps: `github.com/spf13/cobra`, MCP Go SDK (or thin in-house impl over chi).
2. Set up Cobra root in `cmd/bb/main.go` with subcommands: api, mcp, task, auth.
3. Implement `internal/cli/credentials.go` — JSON file at `~/.bumblebee/credentials` with `{base_url, token}`.
4. Implement `internal/cli/client.go` — typed HTTP client (login, tasks CRUD, run).
5. Implement `internal/cli/printer.go` — table formatting (text/tabwriter), `--json` flag.
6. Implement `cmd/bb/task.go` — Cobra commands wrap client.
7. Implement `cmd/bb/auth.go` — login prompts + token store.
8. Implement `internal/mcp/server.go` — Streamable HTTP at `/mcp` (POST stream-of-JSON).
9. Implement each tool handler — call same service layer as REST API.
10. `task_run` tool subscribes to EventBus for that run and writes events as MCP stream chunks.
11. Cross-platform release: `goreleaser` config — Linux/macOS/Windows binaries.
12. Smoke test: `bb auth login` → `bb task create` → `bb task run --phase clarify`. From Claude Code with `mcp add bumblebee`, call same tools.

## Todo List
- [ ] Cobra root + subcommand wiring
- [ ] Credentials file read/write
- [ ] HTTP client typed methods
- [ ] Printer (table + JSON)
- [ ] Task CLI subcommands
- [ ] Auth CLI command
- [ ] MCP server (Streamable HTTP)
- [ ] 5 MCP tools registered
- [ ] task_run streams events
- [ ] goreleaser config
- [ ] End-to-end CLI demo
- [ ] End-to-end MCP demo (from Claude Code)

## Success Criteria
- `bb --help` lists api, mcp, task, auth.
- `bb task list` returns tasks from server.
- `bb task run BB-1 --phase implement` triggers run, prints events as they arrive.
- Claude Code with bumblebee MCP can call `task_create` and `task_run`, observing streamed events.
- Single binary <30MB.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MCP Streamable HTTP spec churn | M | M | pin SDK version; isolate behind interface |
| CLI clients on Windows path issues | M | L | use `os.UserHomeDir()`, never hardcode `/` |
| Tool input schema drift vs handlers | M | M | generate Go structs from JSON schema (or vice versa); contract tests |
| token leak in credentials file | L | H | chmod 0600, document in README |

## Security Considerations
- Credentials file mode 0600.
- MCP server requires `X-BB-Token`; reject anonymous.
- CLI `--insecure` flag required for non-HTTPS base URL (production refuses).
- No tool exposes raw SQL or filesystem read outside project root.

## Rollback
- `bb mcp` is independent server — kill process, MCP unavailable, REST/CLI unaffected.
- CLI versions side-by-side via Go install path; downgrade = `go install ...@vX.Y`.

## Next Steps / Dependencies
- Phase 06 worktree manager will be triggered via `task_run` tool.
- Phase 04 web UI calls REST API directly (not MCP); MCP is for AI clients only.
