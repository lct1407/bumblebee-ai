# Sprint 1 — Multi-Device Safety (CRITICAL)

**Status**: pending
**Effort**: ~5 days (1 week)
**Blocker for**: running 2+ devices concurrently on same project

## Problem

Bumblebee already supports multiple devices (desktop Tauri + CLI daemon). Queue uses SKIP LOCKED — safe for dequeue. But **downstream operations race**:

- Two devices pick different items in same repo → both checkout `feat/bb-42` → branch collision
- Two devices merge to `release/dev` concurrently → non-fast-forward push failure
- Device crashes mid-execute → item stuck `running` forever
- Devices share provider API key → no per-device quota enforcement → one device exhausts budget

## Phase A1 — Branch Allocator Service

**Effort**: 1 day

### Requirements
- Server allocates unique branch name before device checkout
- Format: `{type}/bb-{number}_{slug}_{device4hash}`
  - `type` = feat|fix|chore|refactor (from work_item.type mapping)
  - `slug` = kebab-case(title), truncated 30 chars
  - `device4hash` = first 4 chars of device_id hash
  - Counter suffix `_2`, `_3` on collision (rare)

### Files to Create
- `api/src/services/branch_allocator_service.py` (~100 lines)
  - `async def allocate_branch(work_item_id, device_id, repo_url) -> str`
  - `async def release_branch(branch_name)` — call after merge/abandon
- `api/alembic/versions/{rev}_add_branch_allocations.py`

### Schema
```sql
CREATE TABLE branch_allocations (
  id SERIAL PRIMARY KEY,
  repo_url TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  work_item_id UUID NOT NULL REFERENCES work_items(id),
  device_id UUID REFERENCES devices(id),
  allocated_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ,
  UNIQUE(repo_url, branch_name)
);
CREATE INDEX idx_branch_active ON branch_allocations(repo_url) WHERE released_at IS NULL;
```

### API
- `POST /api/branches/allocate` → `{branch_name}`
- `POST /api/branches/{name}/release`

### Modify
- CLI daemon: call allocate before worktree create, store in session metadata
- `cli/src/bumblebee/agent/*.py` — replace manual branch name generation

## Phase A2 — Device-Prefixed Worktree Paths

**Effort**: 4 hours

### Change
```
Before: ~/.bumblebee/worktrees/{slug}/item-42
After:  ~/.bumblebee/worktrees/{device_id}/{slug}/item-42
```

### Why
- Current: if user runs desktop + CLI daemon on same machine → collision
- After: each device has isolated tree, even on same machine

### Files to Modify
- `cli/src/bumblebee/agent/worktree.py` (or equivalent)
- Tauri daemon `src-tauri/src/daemon.rs` — same path format

### Migration
- Existing worktrees: leave in place (script offers to migrate or abandon)
- Log warning once on startup if legacy path detected

## Phase A3 — Work Item Execution Locks

**Effort**: 1 day

### Problem
Queue race is safe, but `work_items.status = 'in_progress'` not enforced uniquely → if dispatch logic has bug, same item runs on 2 devices.

### Solution
Add `execution_lock` JSONB column + unique partial index:
```sql
ALTER TABLE work_items ADD COLUMN execution_lock JSONB;
-- Shape: {device_id, session_id, acquired_at, expires_at}
CREATE UNIQUE INDEX idx_work_item_single_exec ON work_items(id)
  WHERE execution_lock->>'device_id' IS NOT NULL;
```

### Lifecycle
- Before dispatch: `UPDATE ... SET execution_lock = '{...}' WHERE execution_lock IS NULL` (atomic)
- On session complete/fail: clear lock
- `stale_session_scanner` (existing): release expired locks (>45 min)

### Files to Modify
- `api/src/services/pipeline_orchestrator.py` — acquire lock on dispatch
- `api/src/services/agent_session_service.py` — release on complete

## Phase A4 — Per-Device Rate Limits

**Effort**: 1 day

### Config per device (stored in `devices.config` JSONB)
```json
{
  "max_concurrent_sessions": 2,
  "max_sessions_per_hour": 20,
  "max_tokens_per_day": 500000,
  "cost_limit_usd_per_day": 10.0,
  "allowed_providers": ["anthropic"]
}
```

### Usage tracking
```sql
CREATE TABLE device_usage (
  device_id UUID NOT NULL,
  hour_bucket TIMESTAMPTZ NOT NULL,
  session_count INT DEFAULT 0,
  token_count BIGINT DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  PRIMARY KEY (device_id, hour_bucket)
);
```

### Dispatch gate
`can_dispatch(device_id, estimated_tokens) -> (allowed, reason)`:
1. Concurrent check (existing)
2. Hourly session count
3. Daily token budget
4. Daily cost budget
5. Provider allowlist

### UI
- Device detail page: usage bars (hourly/daily/cost)
- Bumblebee `/projects/{slug}/devices` already exists — extend

## Phase A5 — Merge Coordinator + Queue

**Effort**: 2 days

### Why server-side (not device-side)
- Device A + B both ready to merge → git push race
- Conflict resolution needs consistent rebase base
- Human intervention on conflict needs centralized state

### Flow
```
Device completes work → POST /api/merge-requests
  → Row in merge_queue (state=queued)
Background worker (1 per repo):
  → SELECT ... FOR UPDATE SKIP LOCKED WHERE state='queued' AND repo not in-flight
  → state=processing
  → git fetch + merge --no-ff + push
  → success: state=done, trigger next phase
  → conflict: state=conflict, notify user, leave for human
```

### Schema
```sql
CREATE TABLE merge_queue (
  id SERIAL PRIMARY KEY,
  repo_url TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  work_item_id UUID NOT NULL,
  state TEXT DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT
);
CREATE UNIQUE INDEX idx_merge_active ON merge_queue(repo_url) WHERE state='processing';
```

### Files to Create
- `api/src/services/merge_coordinator.py` (~200 lines, background task)
- `api/src/routers/merge_requests.py`

### Workspace
- API server clones repos to `/var/lib/bumblebee/merge-workspaces/{repo_hash}/` (persistent cache)
- Update via `git fetch` before each merge

## Sprint 1 Deliverables

- [ ] `branch_allocations` + `merge_queue` + `device_usage` tables migrated
- [ ] `execution_lock` column added to work_items
- [ ] Branch allocator API + integration with CLI daemon
- [ ] Device-prefixed worktree paths (CLI + Tauri)
- [ ] Execution lock acquire/release lifecycle
- [ ] Per-device rate limit dispatch gate
- [ ] Merge coordinator background worker
- [ ] UI: device usage bars
- [ ] Integration test: 3 devices × 10 items, verify zero branch collisions, zero dual-dispatch

## Unresolved Questions

- Should `device_usage` track per-provider (not just aggregate) for multi-provider users?
- Merge coordinator failure mode: retry N times then escalate to user? What N?
- Branch allocation TTL: auto-release if device never pushes after X hours?
