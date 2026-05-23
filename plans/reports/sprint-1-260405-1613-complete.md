# Sprint 1 Complete — Multi-Device Safety

**Date:** 2026-04-05
**Branch:** feat/multi-device-hybrid-executor
**Plan:** plans/260405-1159-bb-multi-device-hybrid-executor/

## Status

5/5 phases DONE | 34/34 unit tests pass | 5 commits | ~1300 LOC added

## Phases

| BB  | Phase                    | Commit  | Tests |
|-----|--------------------------|---------|-------|
| 7   | A1 Branch Allocator      | c749a52 | 11    |
| 8   | A2 Worktree Path Prefix  | 7828c9e | manual|
| 9   | A3 Execution Locks       | baab7fd | 5     |
| 10  | A4 Per-Device Rate Limits| f34e0da | 7     |
| 11  | A5 Merge Coordinator     | 3756eb0 | 3     |

BB-6 (Sprint 1 story) → in_review

## New schema

- `branch_allocations` (repo_url, branch_name unique) + partial active index
- `work_items.execution_lock` JSONB + partial unique index
- `device_usage` (device_id, hour_bucket PK) — hourly rollup buckets
- `merge_queue` + partial unique index ensuring 1-in-flight per repo

## New services

- `branch_allocator_service` — slugify + type prefix + device hash, counter retry on collision
- `execution_lock_service` — acquire/release/refresh/force_release with TTL 45min
- `device_usage_service` — record_usage, can_dispatch (5-check gate), summaries
- `merge_coordinator_service` — SKIP LOCKED enqueue/claim/terminal states

## New endpoints

```
POST   /api/branches/allocate           unique branch name allocation
POST   /api/branches/release            idempotent release
GET    /api/branches/work-items/{id}/active

GET    /api/devices/{id}/usage          hourly+daily rollup
GET    /api/devices/{id}/can-dispatch   preflight check

POST   /api/merge-requests              enqueue merge
GET    /api/merge-requests              list (filter repo/state)
GET    /api/merge-requests/{id}         detail
POST   /api/merge-requests/{id}/cancel  cancel queued
```

## CLI changes

- `cli-ts/src/lib/device.ts` — shared `getOrCreateDeviceUid` + `getDeviceShortCode`
- `cli-ts/src/commands/agent.ts` — WORKTREES_DIR now device-scoped
  - New path: `~/.bumblebee/worktrees/{device8}/{slug}/item-N`
  - Legacy fallback with one-time warning
- `cli-ts/src/commands/daemon.ts` — refactored to import from shared lib

## Pending integrations (Sprint 3 candidates)

1. **Wire branch_allocator** into CLI agent commands (currently still uses local `buildBranchName`) — should call `POST /api/branches/allocate` before `git checkout -b`
2. **Wire execution_lock** into `pipeline_orchestrator.on_status_change()` — acquire before dispatch, release on session complete
3. **Wire device_usage.record_usage()** into session lifecycle (after agent_session cost recorded)
4. **Merge coordinator git runner** — actual `git fetch/merge/push` subprocess + workspace cache at `/var/lib/bumblebee/merge-workspaces/{repo_hash}/`

## Deploy checklist

```bash
# 1. Run migrations on staging DB
cd api && alembic upgrade head
# Expect 4 new migrations: a4b1c2d3e4f5, b5c2d3e4f5a6, c6d3e4f5a6b7, d7e4f5a6b7c8

# 2. Rebuild CLI
cd cli-ts && npm run build && npm link

# 3. Restart API server

# 4. Verify endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/devices/1/usage
curl -X POST -H "..." -d '{"work_item_id":1,"device_id":1,"repo_url":"..."}' http://localhost:8000/api/branches/allocate

# 5. Multi-device test
# - Run 2 CLI daemons on same machine
# - Enqueue 5 items via pipeline
# - Verify distinct device_short codes in worktree paths
```

## Next session

Start Sprint 2 B1 — Executor Abstraction Interface (BB-12, 2 days)
- Protocol `AgentExecutor` with execute/get_status/stream_events/cancel
- LocalDaemonExecutor (wrap existing dispatch)
- RemoteProxyExecutor (stub for B2)
- Router: `executor_router.dispatch(phase, item, project)` replaces direct queue.enqueue

## Unresolved

- Merge coordinator git workspace path — where runs? API server, or dedicated merge worker process?
- `execution_lock` TTL refresh: auto-extended during heartbeat, or explicit refresh endpoint?
- Branch name format validation: reject names matching existing refs on remote?
