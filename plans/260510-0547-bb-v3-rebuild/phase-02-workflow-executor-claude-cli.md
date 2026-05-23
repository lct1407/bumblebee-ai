# Phase 02 — Workflow YAML Executor + ClaudeCLIRunner

## Context Links
- [plan.md](plan.md)
- [phase-01-repo-api-skeleton.md](phase-01-repo-api-skeleton.md)
- [research/jarvis-agents-architecture-analysis.md](research/jarvis-agents-architecture-analysis.md) — workflow-as-data adoption
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md) — pain 3 (orchestrator brittle), pain 4 (Runner illusion)

## Overview
- **Priority:** P1
- **Status:** pending
- **Week:** 2
- **Brief:** YAML-defined workflow drives task status machine via `Runner` interface. First runtime: ClaudeCLIRunner subprocess. Idempotent, transactional, streamable.

## Key Insights
- v2 orchestrator failed because dispatch + status update + queue insert were not atomic. Fix: single tx + idempotency key.
- YAML is editable without redeploy; git-versioned diffs make changes auditable.
- `Runner.Dispatch` returns event channel; same channel later powers WebSocket UI in Phase 04.
- Skill body lives in `.bumblebee/skills/{name}.md` (next phase loads them); for now hardcode 1 skill prompt for the implement phase smoke test.

## Requirements

### Functional
- Workflow YAML parser produces in-memory FSM.
- `WorkflowExecutor.OnTaskStatusChange(task, newStatus)` looks up matching rule → dispatches runner.
- `Runner` interface (`Dispatch(ctx, req) (<-chan Event, error)`).
- `ClaudeCLIRunner` spawns `claude` subprocess with constructed prompt, streams stdout as events, returns exit code.
- Phase dispatch idempotency key: `(task_id, phase, attempt)` UNIQUE.
- On runner success: append to `task_events`, advance task status per workflow's `on_success` rule, in single tx.
- On runner failure: status → `failed`, log payload.
- Manual trigger endpoint: `POST /tasks/:id/run?phase=implement`.

### Non-Functional
- Executor goroutine-safe; one task = one in-flight run at a time (advisory lock on task_id).
- All YAML loaded once at startup; reloadable via SIGHUP.
- Skill prompt files <300 lines.

## Architecture

```
┌────────────────────────────────────────────────────┐
│  workflow.yaml ──► Loader ──► FSM (in-memory)      │
└────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────┐
│  WorkflowExecutor                                  │
│   - subscribes to status-change events             │
│   - per-task advisory lock (pg_advisory_xact_lock) │
│   - inserts run row (idempotency key)              │
│   - selects Runner from registry                   │
└────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────┐
│  Runner (interface) — 2 adapters only              │
│   ├─ ClaudeCLIRunner (subprocess, all Claude work) │
│   └─ GeminiVertexRunner [added Phase 05]           │
└────────────────────────────────────────────────────┘
            │
            ▼ stream events
┌────────────────────────────────────────────────────┐
│  EventBus → DB (task_events) + future WS broadcast │
└────────────────────────────────────────────────────┘
```

## Related Code Files (to create)

```
internal/workflow/types.go               — Workflow, Phase, Rule structs
internal/workflow/loader.go              — YAML parser + validation
internal/workflow/executor.go            — orchestration core
internal/workflow/registry.go            — task → in-flight map + advisory lock
internal/runners/runner.go               — Runner interface + Event type
internal/runners/registry.go             — name → Runner map
internal/runners/claude_cli.go           — subprocess implementation
internal/runners/event_parser.go         — parse Claude CLI stdout to events
internal/skills/loader.go                — read .bumblebee/skills/*.md (frontmatter)
internal/eventbus/bus.go                 — channel-based pub/sub (in-process)
internal/api/runs/handler.go             — POST /tasks/:id/run
migrations/0003_runs.up.sql              — task_runs table
.bumblebee/workflows/default.yaml        — example workflow
.bumblebee/skills/implement.md           — first skill (prompt)
```

### Migration (0003_runs.up.sql)

```sql
CREATE TYPE run_state AS ENUM ('queued','running','succeeded','failed','cancelled');

CREATE TABLE task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  runner TEXT NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  state run_state NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  payload JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  exit_code INT,
  UNIQUE (idempotency_key)
);
CREATE INDEX idx_task_runs_task ON task_runs(task_id, started_at DESC);
```

### Workflow YAML (.bumblebee/workflows/default.yaml)

```yaml
name: default
description: Linear flow draft -> done
phases:
  - name: clarify
    runner: claude-cli   # later: gemini-vertex
    skill: clarify
    on_status_enter: clarifying
    on_success: planned
    on_failure: needs_info
  - name: plan
    runner: claude-cli
    skill: plan
    on_status_enter: planned
    on_success: approved   # auto-approve in dev; gate added Phase 08
    on_failure: failed
  - name: implement
    runner: claude-cli
    skill: implement
    on_status_enter: running
    on_success: review
    on_failure: failed
  - name: review
    runner: claude-cli
    skill: review
    on_status_enter: review
    on_success: done
    on_failure: running
```

### Skill markdown (.bumblebee/skills/implement.md)

```markdown
---
name: implement
runner: claude-cli
model: default
max_tokens: 16000
tools: [Read, Edit, Write, Bash]
---
You are implementing the task below. Follow KISS/DRY/YAGNI.

Task: {{.Task.Title}}
Description: {{.Task.Description}}
Plan: {{.SessionContext.plan}}

Apply changes, run tests, report status DONE or BLOCKED.
```

### Runner interface

```go
package runners

type EventKind string
const (
  EventStart  EventKind = "start"
  EventStdout EventKind = "stdout"
  EventStderr EventKind = "stderr"
  EventToolUse EventKind = "tool_use"
  EventEnd    EventKind = "end"
)

type Event struct {
  Kind EventKind
  Data map[string]any
  At   time.Time
}

type DispatchRequest struct {
  TaskID         uuid.UUID
  Phase          string
  Skill          Skill
  WorkingDir     string
  SessionContext map[string]any
}

type Runner interface {
  Name() string
  Dispatch(ctx context.Context, req DispatchRequest) (<-chan Event, error)
}
```

## Implementation Steps

1. Add deps: `gopkg.in/yaml.v3`, `github.com/google/uuid`.
2. Write `internal/workflow/types.go` — Workflow/Phase structs match YAML.
3. Write `loader.go` — read YAML, validate phase names match workflow rules, status references valid.
4. Write migration 0003, regenerate sqlc.
5. Write `internal/eventbus/bus.go` — simple in-process pub/sub for now.
6. Write `internal/runners/runner.go` — interface + Event type.
7. Write `internal/runners/claude_cli.go`:
   - render skill template with Go `text/template`
   - `exec.CommandContext("claude", "--print", "--permission-mode", "bypassPermissions")`
   - pipe rendered prompt to stdin
   - scan stdout line-by-line, emit events
   - return on process exit
8. Write `internal/skills/loader.go` — read `.md`, parse frontmatter (`yaml.Unmarshal` of fenced block).
9. Write `internal/workflow/executor.go`:
   - on status change → find matching phase
   - acquire `pg_advisory_xact_lock(hash(task_id))`
   - insert task_runs row with idempotency key `task_id:phase:attempt`
   - launch goroutine running runner; persist events; on completion update task.status per `on_success`/`on_failure` in tx
10. Wire executor into tasks service: after status update, call `executor.OnTaskStatusChange`.
11. Add `POST /tasks/:id/run?phase=X` handler — manual trigger.
12. Write `.bumblebee/workflows/default.yaml` + `.bumblebee/skills/{clarify,plan,implement,review}.md` (clarify/plan/review may be stubs that just echo).
13. Smoke test: create task → PATCH status → observe ClaudeCLI invocation → status auto-advances to next.

## Todo List
- [ ] Workflow YAML loader + validator
- [ ] Migration 0003 (task_runs)
- [ ] Skill markdown loader (frontmatter)
- [ ] Runner interface + Event type
- [ ] ClaudeCLIRunner subprocess + event stream
- [ ] EventBus in-process
- [ ] Executor with advisory lock + idempotency
- [ ] Manual trigger endpoint
- [ ] 4 skill .md files (1 real, 3 stubs)
- [ ] End-to-end smoke: draft→clarifying→planned→approved→running→review→done via curl

## Success Criteria
- `curl PATCH /tasks/:id status=clarifying` triggers ClaudeCLI subprocess.
- `task_runs` row exists with state=succeeded/failed.
- `task_events` shows phase_start/phase_end entries.
- Status auto-advances per workflow YAML.
- Re-triggering same phase with same idempotency key returns existing run (no duplicate).
- Killing the API mid-run leaves task in `running` (advisory lock released by tx); restart can re-trigger.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude CLI not installed on host | M | H | startup check; `bb api --runners claude-cli` flag; clear error |
| Subprocess hangs forever | M | H | ctx timeout 30min; SIGKILL on cancel |
| YAML edits break running tasks | M | M | validate on load; SIGHUP reload but in-flight runs use cached copy |
| Stdout parser brittle to CLI updates | H | M | structured `--output-format json-stream` if available; fallback line scan |
| Advisory lock leaks | L | M | `pg_advisory_xact_lock` (auto-released on tx end) |

## Security Considerations
- Skill files trusted (live in repo). Do not load skills from user-supplied paths.
- Subprocess inherits limited env (whitelist: PATH, HOME, ANTHROPIC_API_KEY).
- Working dir confined to project worktree (Phase 06 enforces); for now use `/tmp/bb-runs/{task_id}`.

## Rollback
- Disable executor: env `BB_WORKFLOW_DISABLED=1` skips `OnTaskStatusChange`. Tasks remain manually-driven via PATCH.
- DB rollback: `migrate down 1` drops `task_runs`.

## Next Steps / Dependencies
- Phase 03 (CLI/MCP) needs the manual run endpoint to expose `task_run` MCP tool.
- Phase 04 (Web) needs EventBus to broadcast over WS.
- Phase 05 adds GeminiVertexRunner — same interface, no executor changes. No Claude HTTP API runner; all Claude phases stay on ClaudeCLIRunner.
