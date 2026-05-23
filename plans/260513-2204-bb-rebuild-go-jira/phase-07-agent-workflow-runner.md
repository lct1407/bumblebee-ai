# Phase 07 — Agent Layer A: Workflow + Runner (W7: 2026-07-02 → 07-08)

> **Goal:** Workflow YAML executor, ClaudeCLIRunner, agent_session schema, queue with SKIP LOCKED + lease-based locking + reaper.

## Context links
- [plan.md](plan.md) §2.2, §2.3
- [Phase 06](phase-06-jira-advanced.md) (prereq — v3.0 MVP done)
- Research: `../reports/researcher-260513-2210-jarvis-flow-pipeline.md` — runner interface + queue protocol
- Research: `../reports/researcher-260513-2211-bb-pipeline-orchestrator.md` — what to KEEP vs FIX

## Overview
- **Priority:** P1
- **Status:** pending (v3.1)
- **Effort:** 7 days

## Key insights from research
- **ADOPT (jarvis):** template-driven pipeline (YAML), Runner interface `Health/CanHandle/Dispatch/Cancel`, session_context JSONB continuity, dedup window 2min, reopen cycle cap 5
- **KEEP (BB v2):** SKIP LOCKED dequeue, work_item_events log, heartbeat 90s offline detection, session_context JSONB
- **FIX (BB v2):** add idempotency keys (unique index `(work_item_id, phase, expected_status)`), lease-based queue locking with reaper job, atomic device load via semaphore counter
- **NEW:** Status enum extends to add `running` (between todo/in_review) and `failed` (between running/cancelled or blocked)

## Statuses extended (v3.1)

```
backlog → todo → running → in_review → done
                    ↓            ↘ cancelled
                   failed
                  blocked  (side)
```

Migration `000010_add_agent_statuses.up.sql`:
```sql
ALTER TYPE work_item_status ADD VALUE 'running' AFTER 'todo';
ALTER TYPE work_item_status ADD VALUE 'failed' AFTER 'in_review';
```

## New tables

```sql
-- migrations/000011_agent_sessions.up.sql

CREATE TYPE agent_session_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE agent_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id    UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    workflow_phase  TEXT NOT NULL,                  -- "implement", "test", "review", ...
    runner          TEXT NOT NULL,                  -- "claude-cli", "gemini-vertex"
    status          agent_session_status NOT NULL DEFAULT 'queued',
    prompt          TEXT,
    output          TEXT,                            -- accumulated stdout
    error           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    cost_usd        NUMERIC,
    tokens_input    INT,
    tokens_output   INT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_item_id, workflow_phase, status) WHERE status IN ('queued', 'running')
    -- Idempotency: cannot queue same phase if one is already queued/running for same item
);

CREATE INDEX idx_agent_sessions_work_item ON agent_sessions (work_item_id, created_at DESC);

CREATE TABLE agent_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL UNIQUE REFERENCES agent_sessions(id) ON DELETE CASCADE,
    priority        INT NOT NULL DEFAULT 0,
    locked_by       TEXT,                            -- device_id
    locked_at       TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,                    -- locked_at + lease_duration (5min)
    attempts        INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 3,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_queue_dispatch ON agent_queue (priority DESC, created_at) WHERE locked_by IS NULL;

CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    user_id         UUID REFERENCES users(id),
    hostname        TEXT,
    capabilities    JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_concurrent  INT NOT NULL DEFAULT 2,
    current_load    INT NOT NULL DEFAULT 0,          -- atomic counter
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_online       BOOLEAN NOT NULL DEFAULT TRUE,
    is_draining     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_active ON devices (is_online, is_draining, current_load);

CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    yaml_content    TEXT NOT NULL,
    parsed          JSONB,                            -- cached parsed AST
    version         INT NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, name, version)
);
```

## Workflow YAML format

```yaml
# .bumblebee/workflows/default.yaml (committed in user's project repo)
name: default
version: 1
triggers:
  - on: status_change
    from: todo
    to: running
    skill: implement
    runner: claude-cli
    timeout: 1800
    retry:
      max: 3
      on: [transient, quota]

  - on: status_change
    from: running
    to: in_review
    skill: test
    runner: claude-cli
    timeout: 600

  - on: status_change
    from: in_review
    to: done
    skill: review
    runner: claude-cli
    on_fail:
      transition: failed
      max_cycles: 5
```

## Runner interface (Go)

```go
// internal/runner/runner.go
type Runner interface {
    Name() string
    Health(ctx context.Context) error
    CanHandle(skill string) bool
    Dispatch(ctx context.Context, req DispatchRequest, events chan<- StreamEvent) error
    Cancel(ctx context.Context, sessionID string) error
}

type DispatchRequest struct {
    SessionID    string
    WorkItem     *WorkItem
    Skill        string
    Prompt       string
    Context      json.RawMessage   // session_context from prev phase
    WorkingDir   string             // git worktree path
}

type StreamEvent struct {
    Type    string             // "text", "tool_use", "tool_result", "done", "error"
    Payload json.RawMessage
}

type RunnerError struct {
    Class string                 // "transient" | "quota" | "unsupported" | "fatal"
    Err   error
}
```

## ClaudeCLIRunner sketch

```go
// internal/runner/claude_cli.go
type ClaudeCLIRunner struct {
    binPath  string                  // "claude"
    sema     chan struct{}           // concurrency limit
}

func (r *ClaudeCLIRunner) Dispatch(ctx context.Context, req DispatchRequest, events chan<- StreamEvent) error {
    r.sema <- struct{}{}
    defer func() { <-r.sema }()

    cmd := exec.CommandContext(ctx, r.binPath,
        "--permission-mode", "bypassPermissions",
        "--output-format", "stream-json",
        "--print", req.Prompt,
    )
    cmd.Dir = req.WorkingDir
    stdout, _ := cmd.StdoutPipe()
    cmd.Start()

    scanner := bufio.NewScanner(stdout)
    for scanner.Scan() {
        line := scanner.Bytes()
        var ev claudeStreamEvent
        if err := json.Unmarshal(line, &ev); err == nil {
            events <- mapToStreamEvent(ev)
        }
    }
    return cmd.Wait()
}
```

## Implementation steps

### Day 1 — Schema + migrations
Run `000010_add_agent_statuses.up.sql`, `000011_agent_sessions.up.sql`. Update transition validator.

### Day 2 — Runner interface + ClaudeCLIRunner
Implement Runner interface. Wire subprocess + stream parser. Tests with mock claude binary.

### Day 3 — Workflow YAML parser
Load YAML, validate schema (yaml.v3 + go-playground/validator), parse to AST cached in DB. Endpoint: `POST /api/projects/{key}/workflows` (upload/update YAML).

### Day 4 — Orchestrator
`internal/orchestrator/orchestrator.go`:
- Subscribes to work_item status_change events (in-process event bus)
- Looks up workflow for project
- Matches trigger → creates agent_session → enqueues
- Idempotency: skip if same (item, phase) queued in last 2min
- Reopen cycle cap: refuse if work_item_events shows >5 reopen→running cycles

### Day 5 — Queue worker (in-process daemon mode of `bb`)
`bb daemon` subcommand. Dequeue via SKIP LOCKED + lease (locked_at, lease_expires_at). Heartbeat every 30s (extend lease). Reaper job (every 60s): reclaim sessions with expired leases.

### Day 6 — Status auto-advance
On session complete (success): write output to agent_sessions, update work_item.session_context, advance status per workflow rule. On fail: increment attempts, requeue if attempts < max, else transition to `failed`.

### Day 7 — Tests + staging
Integration: workflow YAML upload → status change → session created → daemon runs → output captured → status advanced. Run on staging with real Claude CLI.

## Related files
- New: `internal/runner/*`, `internal/orchestrator/*`, `internal/workflow/*`, `internal/agentsessions/*`, `internal/queue/*`, `internal/devices/*`, `migrations/000010_*`, `migrations/000011_*`, `cmd/bb/daemon.go`
- Modified: `internal/workitems/service.go` (emit events on status change)

## Todo list
- [ ] agent_sessions + agent_queue + devices + workflows tables
- [ ] Runner interface defined
- [ ] ClaudeCLIRunner subprocess + stream parser
- [ ] Workflow YAML upload + parse
- [ ] Orchestrator triggers on status change
- [ ] Daemon dequeues + executes
- [ ] Lease-based locking + reaper
- [ ] Status auto-advance on completion
- [ ] Reopen cycle cap enforced

## Success criteria (DoD)
- Upload workflow YAML, change item status todo → running → session created, daemon picks up, runs claude, output saved, status auto-advances to in_review
- Kill daemon mid-run → reaper reclaims lease within 6min → another daemon picks up
- Idempotency: rapid double-update same item → only one session created

## Risks
- **Risk:** Claude CLI version drift breaking stream-json parser — mitigation: feature-detect on startup, fall back to plain text mode
- **Risk:** Long-running agent (>30min) — mitigation: timeout in workflow YAML, hard kill via cancel context

## Next steps
→ [Phase 08 — Agent Layer B: Streaming + CLI + MCP](phase-08-agent-stream-cli-mcp.md)
