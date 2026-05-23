# Phase 06 — Worktree Manager + Parallel Sessions

## Context Links
- [plan.md](plan.md)
- [phase-02-workflow-executor-claude-cli.md](phase-02-workflow-executor-claude-cli.md)
- [phase-04-web-ui-mvp.md](phase-04-web-ui-mvp.md)
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md) — pain 6 (worktree single-machine)

## Overview
- **Priority:** P1
- **Status:** pending
- **Week:** 6
- **Brief:** Each running task gets a dedicated git worktree. 3+ concurrent sessions safe. WebSocket multiplexes streams to UI.

## Key Insights
- v2 had ~2 concurrent semaphore in daemon and git lock conflicts. Fix: worktree-per-task on dedicated path; mutex per parent repo's `.git/index.lock`.
- ClaudeCLIRunner (Phase 02) currently runs in `/tmp/bb-runs/{task_id}` — replace with worktree path.
- Cleanup is critical: orphan worktrees pile up. Reaper job sweeps stale entries.
- WebSocket multiplexer already exists from Phase 04; this phase extends it for fan-out across parallel runs.

## Requirements

### Functional
- `WorktreeManager.Acquire(taskID, baseRepo, baseBranch)` returns path + branch.
  - Creates branch `task/{slug}-{number}` from `baseBranch`.
  - `git worktree add ~/.bumblebee/worktrees/{slug}/{number}` if not exists.
  - Idempotent — returns existing if already provisioned.
- `WorktreeManager.Release(taskID, mode)` where mode in `{keep, prune}`.
- Per-task mutex prevents 2 phases running concurrently in same worktree (different tasks ok).
- Configurable concurrency cap (`BB_MAX_CONCURRENT_RUNS`, default 3).
- Reaper goroutine every 10min: prunes worktrees whose tasks are `done|wont_fix|failed` for >24h.
- WS multiplexer fans out events from N concurrent runs to subscribers, each event tagged `task_id` + `run_id`.
- Web detail page subscribes to `task:{id}` topic only — gets only its events.
- New `/runs` page (under `/tasks/[id]`) listing run history per task.

### Non-Functional
- Worktree provisioning <2s.
- Memory per active run <50MB on Go side.
- Concurrent run count visible in `/healthz/runs`.

## Architecture

```
                   ┌──────────────────────────┐
                   │  WorkflowExecutor        │
                   │  (Phase 02)              │
                   └──────────────────────────┘
                           │ Dispatch
                           ▼
                   ┌──────────────────────────┐
                   │  WorktreeManager         │
                   │  - acquire/release       │
                   │  - per-task mutex        │
                   │  - parent-repo mutex     │
                   └──────────────────────────┘
                           │ workdir path
                           ▼
                   ┌──────────────────────────┐
                   │  Runner (CLI/API/Vertex) │
                   │  N goroutines parallel   │
                   └──────────────────────────┘
                           │ events
                           ▼
                   ┌──────────────────────────┐
                   │  EventBus (Phase 02)     │
                   │  topic: task:{id}        │
                   │         run:{id}         │
                   └──────────────────────────┘
                           │
                           ▼
                   ┌──────────────────────────┐
                   │  WS Multiplexer (Phase 04)│
                   │  - per-conn subscriptions │
                   │  - heartbeat 30s          │
                   └──────────────────────────┘
                           │
                           ▼
                       Web client(s)
```

Worktree layout:
```
~/.bumblebee/worktrees/
  {project-slug}/
    {task-number}/      ← worktree, branch task/{slug}-{number}
```

## Related Code Files (to create)

```
internal/worktree/manager.go           — Acquire/Release/Prune
internal/worktree/git.go               — exec.Command wrappers
internal/worktree/lockmap.go           — keyed mutex
internal/worktree/reaper.go            — periodic prune goroutine
internal/runners/claude_cli.go         — UPDATE: use WorktreeManager
internal/api/runs/list_handler.go      — GET /tasks/:id/runs
internal/api/health/runs_handler.go    — GET /healthz/runs (count + details)
migrations/0005_worktrees.up.sql       — worktrees registry table
internal/eventbus/bus.go               — UPDATE: support multi-topic publish per event

# Web
web/components/tasks/runs-list.tsx
web/components/tasks/run-detail.tsx
web/hooks/use-runs.ts
web/app/tasks/[id]/runs/page.tsx
```

### Migration (0005_worktrees.up.sql)

```sql
CREATE TABLE worktrees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_slug TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',  -- active|stale|pruned
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);
```

## Implementation Steps

1. Migration 0005.
2. Implement `internal/worktree/lockmap.go` — `sync.Map` of `task_id → *sync.Mutex`.
3. Implement `internal/worktree/git.go` — wrappers: `git worktree add/list/remove`, `git branch -D`.
4. Implement `internal/worktree/manager.go`:
   - Acquire: lock task; check DB row; if exists+path-on-disk, return; else `git worktree add`, insert row.
   - Release(prune): `git worktree remove --force`, `git branch -D`, mark row `pruned`.
5. Implement `reaper.go` — every 10min: select stale rows, attempt prune, log failures.
6. Update `ClaudeCLIRunner.Dispatch` to call `manager.Acquire` and use returned path as `cwd`.
7. Add semaphore in executor: `chan struct{}` of size `BB_MAX_CONCURRENT_RUNS`; acquire before runner dispatch, release on completion.
8. Update EventBus to publish each event to BOTH `task:{id}` and `run:{id}` topics.
9. Add `/healthz/runs` returning `{active: N, capacity: M, runs: [...]}`.
10. Web: runs-list and run-detail components; hook into existing detail page.
11. Concurrency stress test script (Bash): create 10 tasks, trigger run on all, verify N run concurrently, others queue.

## Todo List
- [ ] Worktrees migration
- [ ] Lockmap (keyed mutex)
- [ ] Git wrappers
- [ ] WorktreeManager Acquire/Release
- [ ] Reaper goroutine
- [ ] ClaudeCLIRunner uses worktree
- [ ] Concurrency semaphore in executor
- [ ] EventBus multi-topic publish
- [ ] /healthz/runs endpoint
- [ ] Web runs-list + run-detail
- [ ] Stress test 10 tasks / 3 capacity

## Success Criteria
- 10 simultaneous run requests → exactly 3 active at a time, others queued.
- Each run isolated to its own worktree path; no `.git/index.lock` errors.
- Killing API mid-run → on restart, in-flight runs are marked failed; worktrees remain (manual rerun re-uses them).
- Reaper cleans worktrees for `done` tasks after 24h.
- WS subscribers see only their topic's events (verified by inspecting two browser tabs subscribed to different tasks).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Worktree disk usage explodes | M | M | reaper + per-project quota; warn at 10GB |
| Branch conflicts on rebase | M | M | always branch from fresh remote `release/dev`; document |
| Subprocess zombie procs | M | M | ctx-bound exec; explicit `cmd.Process.Kill()` on cancel |
| Concurrency exposes race in EventBus | M | H | add `-race` to CI; test under `go test -race` |
| Stale lockmap entries (memory leak) | L | L | periodic GC of locks for tasks not seen in 1h |

## Security Considerations
- Worktree path under user-owned dir; never under shared system path.
- Subprocess `cwd` validated to be inside `~/.bumblebee/worktrees/`.
- Branch names sanitized (no shell metachars).
- Reaper refuses to delete paths outside worktree root (defense in depth).

## Rollback
- Set `BB_WORKTREES_DISABLED=1` → runner falls back to `/tmp/bb-runs/{task_id}` (Phase 02 behavior).
- DB rollback: `migrate down 1` drops worktrees table; existing on-disk worktrees orphaned (manual cleanup).

## Next Steps / Dependencies
- Phase 07 distiller reads from worktrees (find changed files).
- Phase 08 merge gate operates on worktree branches.
