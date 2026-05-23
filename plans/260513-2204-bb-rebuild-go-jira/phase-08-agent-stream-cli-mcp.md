# Phase 08 — Agent Layer B: Streaming UI + CLI + MCP (W8: 2026-07-09 → 07-15)

> **Goal:** Chat-style stream viewer for live agent sessions, `bb` CLI commands, MCP server for orchestration (not just CRUD).

## Context links
- [plan.md](plan.md) §2.4 + §2.6
- [Phase 07](phase-07-agent-workflow-runner.md) (prereq)
- Research: `../reports/researcher-260513-2210-jarvis-ui-streaming.md` — session WS pattern
- Research: `../reports/researcher-260513-2211-bb-web-architecture-analysis.md` — stream-viewer port

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 7 days

## Key insights from research
- **PORT AS-IS:** BB v2 `agent-stream-viewer.tsx` event-grouping algorithm (handles orphaned tool results, block ordering, meta-event filter, token extraction)
- **PATTERN:** session-targeted WS channel `session:{id}` subscribed when user opens detail page during live run
- **MCP gap (v2 audit):** MCP was CRUD wrapper only — v3 must expose orchestration tools: `task_run`, `task_transition`, `task_stream`

## New WS event types (session channel)

| Event | Payload | When |
|---|---|---|
| `agent:start` | `{session_id, work_item_id, skill, runner}` | Daemon starts session |
| `agent:text_delta` | `{session_id, text}` | Stream stdout chunk |
| `agent:tool_use` | `{session_id, id, name, input}` | Claude invokes tool |
| `agent:tool_result` | `{session_id, id, output, is_error}` | Tool returns |
| `agent:done` | `{session_id, usage}` | Per-iteration complete |
| `agent:complete` | `{session_id, output, cost_usd}` | Full run finished |
| `agent:error` | `{session_id, error}` | Run failed |

## Components added (web)

```
agent/
  AgentStreamViewer.tsx     - chat-style, ported from BB v2 (~400 LOC)
  AgentChatMessage.tsx      - one message (user/assistant/system)
  AgentToolCall.tsx         - collapsible tool call card
  AgentTokenBar.tsx         - input/output/cache token usage bar
  AgentSessionPanel.tsx     - right-panel embed when item is "running"
  AgentSessionsTab.tsx      - new tab in IssueDetail for run history
```

## CLI commands (`bb`)

```
bb auth login                              # interactive: prompt email/password, save JWT to ~/.bumblebee/config
bb auth logout
bb me                                      # show current user

bb project list
bb project create <key> <name>
bb project show <key>

bb item list [--project KEY] [--status STATUS] [--assignee USER]
bb item show <key>-<num>                   # e.g. bb item show PROJ-42
bb item create <project-key> <title> [--type bug] [--parent KEY-NUM] [--assignee USER]
bb item update <key>-<num> [--status ...] [--assignee ...] [--title ...]
bb item transition <key>-<num> --to <status>
bb item delete <key>-<num>

bb comment list <key>-<num>
bb comment add <key>-<num> "body"

bb sprint list [--project KEY]
bb sprint create <project-key> <name>
bb sprint start <id>
bb sprint complete <id>

bb agent run <key>-<num> [--skill implement] [--wait]      # enqueue + optionally tail stream
bb agent sessions <key>-<num>
bb agent logs <session-id>                                  # replay events from REST
bb agent cancel <session-id>

bb daemon start [--max-concurrent 2]                        # worker daemon
bb daemon stop
bb daemon status

bb workflow upload <project-key> <path-to-yaml>
bb workflow show <project-key>

bb mcp serve                                                # start MCP Streamable HTTP server on /mcp
```

CLI uses chi-based JSON RPC against `/api/*`. Output: human table by default, `--json` for scripts. Streams via WS subscription when `--wait`.

## MCP server (orchestration, not just CRUD)

MCP Streamable HTTP at `/mcp`. Tools:

| Tool | Purpose |
|---|---|
| `work_item_list`, `work_item_get`, `work_item_create`, `work_item_update`, `work_item_transition` | CRUD (table stakes) |
| `comment_add`, `comment_list` | Comments |
| `sprint_*` | Sprints |
| **`agent_run`** | Trigger phase: `{work_item_key, skill, prompt_override?}` → returns session_id |
| **`agent_stream`** | Subscribe to session stream (returns SSE events over MCP) |
| **`agent_cancel`** | Cancel running session |
| **`workflow_get`** | Read workflow YAML for project |
| **`search_jql`** | Run JQL query |

## Implementation steps

### Day 1-2 — Stream viewer (web)
1. Port `agent-stream-viewer.tsx` from BB v2, simplify (remove unused props, consolidate sub-components)
2. Subscribe to `session:{id}` WS channel on mount, unsubscribe on unmount
3. Event grouping algorithm (preserve from v2):
   - text_delta → append to current assistant message
   - tool_use → new tool-call entry in current message
   - tool_result → update matching tool by id
   - done → mark current message complete, allow new
   - complete → finalize all + show cost+tokens
4. Auto-scroll to bottom (detect manual scroll-up → pause auto-scroll until user scrolls to bottom)
5. Token usage bar (input/output/cache segments from `done` event usage payload)

### Day 3 — Session history + replay
1. `AgentSessionsTab` in IssueDetail lists all sessions for item
2. Click session → opens viewer in replay mode
3. Replay: fetch `GET /api/agent-sessions/{id}/events` (REST endpoint, returns recorded stream events)
4. Replay plays back events at speed (no WS subscription needed for completed sessions)
5. Active sessions show live stream (WS) instead of replay

### Day 4 — CLI `bb` commands (Go cobra)
1. Cobra subcommand tree per CLI Reference
2. Each subcommand calls API client (`internal/apiclient`)
3. `~/.bumblebee/config.toml` stores token, default project
4. Human output via go-pretty or tablewriter; `--json` flag dumps raw
5. `bb agent run --wait` opens WS subscription, prints stream in terminal

### Day 5 — Daemon mode
1. `bb daemon start` runs as foreground process; `&` for background
2. Registers as device via `POST /api/devices/register`
3. Heartbeat 30s
4. Dequeues from queue + runs via Runner
5. Graceful shutdown SIGTERM: drain (finish current sessions, refuse new) then exit
6. Same code path as in-process daemon from Phase 07 — just exposed via CLI

### Day 6 — MCP server
1. `internal/mcp/server.go` — Streamable HTTP per MCP spec
2. Tools registered via reflection or explicit table
3. `agent_stream` tool returns SSE events (MCP supports streaming)
4. Auth: same JWT as REST (or new MCP API key — decide day 1)
5. Test with Claude Code: `claude mcp add bumblebee https://bumblebee.{domain}/mcp`

### Day 7 — Tests + Claude Code dogfood
1. CLI integration tests (against staging)
2. MCP tested by running this very rebuild on the new system (eat own dogfood from end of phase 08)
3. Stream viewer tested with real Claude session (10+ min run, 1000+ events)
4. Staging green

## Related files
- New: `web/components/agent/*` (6 files), `internal/mcp/*`, `internal/apiclient/*`, `cmd/bb/{auth,item,project,comment,sprint,agent,daemon,workflow,mcp}.go`, `internal/agentsessions/events_replay.go`
- Modified: `cmd/bb/main.go` (cobra root), `internal/workitems/handler.go` (events replay endpoint)

## Todo list
- [ ] Stream viewer ported + WS-subscribed
- [ ] Event grouping handles edge cases (orphaned tools, ordering)
- [ ] Session replay from REST
- [ ] CLI: all commands per reference
- [ ] CLI `--wait` tails WS stream in terminal
- [ ] Daemon: register, heartbeat, drain, dequeue
- [ ] MCP server with orchestration tools (not just CRUD)
- [ ] Dogfood: rebuild Phase 08 itself via the agent layer

## Success criteria (DoD)
- Open issue in `running` state → stream viewer shows live text + tool calls within 200ms of agent action
- `bb agent run PROJ-42 --skill implement --wait` runs end-to-end in terminal
- Claude Code with MCP can call `agent_run` and tail `agent_stream`
- Replay completed session shows same events as live

## Risks
- **Risk:** MCP spec churn — pin to spec version 2025-06, document upgrade plan
- **Risk:** Stream viewer perf on huge sessions (10k events) — mitigation: virtualize messages list, summarize after N events
- **Risk:** CLI binary size with all deps — mitigation: trim deps, single binary <30MB target

## Next steps
→ [Phase 09 — Polish + Migration + Cutover](phase-09-polish-migration-cutover.md)
