# Bumblebee v2 Pipeline Orchestrator & Queue Audit
**Date:** 2026-05-13 | **Scope:** v2.0-rc1 Python codebase | **Target:** Go rewrite Phase 1 (task management only)

---

## 1. Current DB Schema (Annotated)

### v1 (Legacy — mounted at /api/*)
```
work_items
  id, project_id, number, type, status, priority, complexity
  parent_id (self-FK for hierarchy), assignee_id
  session_context (JSONB — multi-phase context persistence)
  execution_lock (JSONB — {device_id, session_id, acquired_at, expires_at})
  branch_name, worktree_path, target_branch
  ✓ GOOD: soft_delete via deleted_at
  ✓ GOOD: event tracking via work_item_events
  ✗ BAD: status is plain VARCHAR(50), no enum constraint
  ✗ BAD: 14 status + 7 legacy aliases baked in (confirmed, backlog, etc.)
  ✗ BAD: no CHECK constraint on valid transitions

work_item_events
  work_item_id, event_type, field_name, old_value, new_value
  ✓ GOOD: tracks all changes for audit trail

agent_queue (agent_queue)
  id, agent_session_id, project_id, priority, status
  locked_by_device_id, locked_at, attempts, max_attempts
  ✓ GOOD: SKIP LOCKED dequeue (atomic, handles contention)
  ✓ GOOD: dead_letter state + comment auto-posting on exhaustion
  ✗ BAD: dequeue() order_by(priority, enqueued_at) but no facility for idempotency keys
  ✗ BAD: heartbeat only refreshes locked_at; no lease expiration management

agent_session
  id, status (idle|pending|running|completed|failed), phase, work_item_id, device_id
  messages (JSONB), token_usage, stop_reason, error
  worktree_path, branch_name, claude_session_id
  ✓ GOOD: phase field for stage tracking (verify, suggest, execute, test, merge)
  ✗ BAD: no workflow_id field (v2 adds this)

devices
  id, name, status (online|offline|busy|draining), owner_id, last_heartbeat
  max_concurrent, current_load (non-atomic—race condition if parallel increments)
  ✓ GOOD: heartbeat + mark_offline_stale(threshold=90s)
  ✗ BAD: current_load not ATOMIC; two devices can exceed max_concurrent

### v2 (New — mounted at /api/v2/*)
```
v2_work_items — identical schema but fresh table
v2_workflow_runs
  id, work_item_id, workflow_id
  current_node_ids (ARRAY[String]) — active nodes in DAG
  state (pending|running|paused|completed|failed|cancelled)
  context (JSONB — shared blackboard for node executors)
  ✓ GOOD: durable resumption (current_node_ids + state for recovery)

v2_queue_items
  id, workflow_run_id, agent_session_id, locked_by_device_id
  status (queued|running|completed|failed), attempts, max_attempts, locked_at
  payload (JSONB — node execution input)
  ✓ GOOD: links to both workflow_run and agent_session
  ✗ BAD: no built-in idempotency key or dedup logic

v2_agent_sessions
  workflow_run_id, definition_id, node_id (in workflow)
  role, model, status (pending|running|completed|failed)
  output, token usage, cost tracking
  ✓ GOOD: role-based model selection
  ✓ GOOD: cost tracking built-in

v2_devices — same structure as v1
v2_agent_definitions — role + system_prompt + allowed_tools (soft multi-model)
```

---

## 2. Status State Machine (Current v1)

### Diagram
```
                    new
                    ↓ (triage)
                triaged
                    ↓ (analyze)
                planned
                    ↓ (approve: auto for S/M, human for C)
                approved
                    ↓ (implement)
            in_progress ←――――――――――┐
                ↓                    │ (reimplement)
            in_review               │
                ↓                    failed ← (test fails)
           developed (C only)       │
                ↓                    │
            deploying ←――――――――――――――┘
                ↓
            testing
                ↓
            staging (auto-skip for S/M)
                ↓
            released
                ↓
            closed

Side gates (from any active):
  → wont_fix
  → needs_info
  → blocked
  → on_hold (deploy fail)
  → reopen (max 5 cycles from in_review)

Legacy aliases (mapped via _LEGACY_STATUS_ALIASES):
  open → new
  confirmed → triaged
  awaiting_review → planned
  backlog → new
  todo → triaged
  resolved → done
  cancelled → wont_fix
```

### Complexity-Driven Routing
```
After triage, complexity set to Simple|Medium|Complex

Simple/Medium path:
  planned → (auto-approve) → approved → in_progress → in_review
           → (auto-skip review) → deploying → testing → staging (auto-skip) → released → closed

Complex path:
  planned → (human approval gate) → approved → in_progress → in_review
          → developed → (independent code review) → deploying → testing → staging (human gate) → released → closed

Retry loops:
  in_review → failed → (auto-reimplement, max 3) → in_progress
  developed → reopen → (auto-fix, max 5) → in_progress
  Total possible retries: up to 15
```

### Evidence Gates (enforce_evidence=True only)
```
new → triaged        requires: "triage" comment
triaged → planned    requires: "proposal" or "analysis" comment
in_progress → in_review  requires: "agent_output" or "review" comment
developed → deploying    requires: "review" or "approval" comment
```

---

## 3. Pipeline Orchestrator Flow (Non-existent in code)

**Key finding:** No `pipeline_orchestrator.py` exists. Status changes are NOT auto-triggering agent phases.

Instead, current implementation:
- Manual CLI commands: `bb agent suggest`, `bb agent execute`, etc.
- v2 has `workflow_runs` table but no executor service (WIP per phase-02-workflow-engine.md)
- CLAUDE.md documents a "pipeline orchestrator" that **does not exist** in code

### What SHOULD happen on status change (from CLAUDE.md, not implemented):
```
new → set by creator
      ↓ (detect status change)
      → on_status_change() hook (MISSING)
        → pipeline_orchestrator.check_enabled()
        → map status to skill/phase
        → create AgentSession + enqueue
        → broadcast WS "queue:item_enqueued"

This would auto-trigger:
  new → triage (auto-enrich, set complexity)
  triaged → analyze (code analysis, propose solution)
  planned → approve/implement (routing on complexity)
  in_progress → test (run tests)
  in_review → review (Complex only)
  deploying → merge + deploy
  failed → reimplement (max 3x)
  reopen → fix (max 5x)
```

### Current reality (work_item_service.py:287-342):
```python
async def update_item(..., changes: dict, enforce_evidence: bool = False):
    # Validates transition via lifecycle_service
    # Tracks changes in work_item_events
    # AUTO-SETS start_date, completed_at
    # NO auto-trigger for agent phases
    # Caller must manually enqueue agent_session
```

---

## 4. Queue Protocol (Working Well)

### Enqueue (queue_service.py:18-46)
```python
async def enqueue(
    db, agent_session_id, project_id, priority=2, required_provider=None, max_attempts=3
) → AgentQueueItem
  Creates agent_queue row with status='queued'
  Broadcasts WS "queue:item_enqueued"
  ✓ Idempotent at application level (caller's responsibility)
  ✗ No DB-level idempotency key (race: same session queued twice)
```

### Dequeue (queue_service.py:49-94) — ATOMIC via SKIP LOCKED
```python
async def dequeue(db, device_id, available_providers=None) → AgentQueueItem | None
  SELECT * FROM agent_queue
    WHERE status = 'queued'
    ORDER BY priority ASC, enqueued_at ASC
    WITH FOR UPDATE SKIP LOCKED  ← PostgreSQL advisory lock
    LIMIT 1
  
  Claim: status='locked', locked_by_device_id=device_id, locked_at=now(), attempts++
  
  ✓ Atomic: no two devices can claim same item
  ✓ Handles thundering herd: SKIP LOCKED lets N devices poll without blocking
  ✓ Respects provider requirements (filter by required_provider)
  ✓ Broadcasts WS "queue:item_dequeued"
```

### Heartbeat (queue_service.py:185-193)
```python
async def heartbeat_item(db, item_id: int) → bool
  UPDATE agent_queue SET locked_at = now() WHERE id=? AND status='locked'
  Prevents reaper from reclaiming stale items
  ✓ Simple lease extension
```

### Complete (queue_service.py:97-109)
```python
async def complete(db, queue_item_id) → AgentQueueItem
  status='locked' → status='completed', completed_at=now()
  No auto-trigger to next phase; caller advances work_item status manually
```

### Fail & Dead Letter (queue_service.py:112-145)
```python
async def fail(db, item_id, error) → AgentQueueItem
  IF attempts >= max_attempts:
    status='dead_letter'
    post_dead_letter_comment(work_item_id, error)
    work_item.status = 'failed'  ← auto-set
  ELSE:
    status='queued'  ← re-enqueue
  
  ✓ Auto-posts comment with error context
  ✓ Re-queuing is automatic
  ✗ No exponential backoff (immediate retry)
  ✗ Max retries per item (3) is hard-coded, not per-session-type
```

### Retry (queue_service.py:228-256)
```python
async def retry(db, item_id) → AgentQueueItem
  ONLY works on dead_letter items
  Resets attempts=0, status='queued'
  Manual operation (user must click "retry" in UI)
```

---

## 5. Device Pool & Fault Tolerance

### Registration (device_service.py:20-111)
```python
async def register_device(...) → (Device, raw_api_key_or_none, already_registered)
  IF device_uid exists AND owned_by_same_user:
    Update in-place, status='online', return (device, None, True)
  ELSE:
    Create new, generate api_key_hash, status='online', return (device, raw_key, False)
  
  ✓ Idempotent re-registration (device_uid + owner_id)
  ✓ API key only issued once (raw_key)
  ✗ No credential rotation mechanism
```

### Heartbeat (device_service.py:114-134)
```python
async def heartbeat(db, device_id) → Device
  last_heartbeat = now()
  IF was offline: status='online', broadcast WS "device:online"
  
  Expected every 30s from daemon
  ✓ Simple state transition
  ✗ No timeout for hung devices (mark offline after 90s gap)
```

### Offline Detection (device_service.py:186-215)
```python
async def mark_offline_stale(db, threshold_seconds=90) → int
  UPDATE devices
    SET status='offline'
    WHERE last_heartbeat < (now - 90s)
    AND status IN ['online', 'busy', 'draining']
  Broadcast WS "device:offline" for each
  
  ✓ Batch operation
  ✗ Called explicitly via background task (not async trigger)
  ✗ Items locked by that device are NOT re-enqueued
```

### Queue Reaper (MISSING)
No service to unlock stale queue items when device goes offline.
**Gap:** If device crashes while locked on queue item:
  - Device marked offline (after 90s)
  - Queue item remains status='locked'
  - No recovery mechanism

---

## 6. Workflow-as-Data v2 (Planned, not implemented)

Per phase-02-workflow-engine.md:
```
Workflow definition: YAML/JSON with nodes (trigger, agent, condition, human approval, git, update, delay)
State machine: WorkflowRun has current_node_ids (ARRAY[str]), state (pending|running|paused|completed|failed)
Context: JSONB blackboard shared across nodes
Expression evaluator: boolean ops only (==, !=, <, >, &&, ||)
Loop guards: max_loops per edge, global max_node_executions=50

Node executors:
  - trigger.* (manual, status_change, item_created, schedule)
  - agent.run, agent.parallel (create session, enqueue, pause waiting for completion)
  - condition.if (evaluate expression, branch)
  - human.approval (pause, wait for POST /approve)
  - git.* (branch, commit, PR, merge)
  - update.* (status, field changes)
  - delay.wait (schedule resume)

Status: design complete, implementation pending (Phase 2 track A, 2 weeks effort)
```

---

## 7. What's Working Well — KEEP for Go

### ✓ Queue Dequeue via SKIP LOCKED
Atomic, handles concurrency perfectly. Go implementation: `SELECT ... FOR UPDATE SKIP LOCKED` is identical SQL.

### ✓ Event Tracking
Every work item change → work_item_events row. Enables full audit trail. Simple pattern: before update, snapshot old state.

### ✓ Device Heartbeat + Offline Detection
Regular heartbeat + threshold-based offline marking is proven fault tolerance pattern.

### ✓ Session Context Persistence (JSONB)
Multi-phase continuity via session_context field. Avoids re-prompting for previous decisions. Keep this pattern.

### ✓ Execution Lock (JSONB)
Prevents dual-dispatch: `execution_lock: {device_id, session_id, acquired_at, expires_at}`. Check + set atomically on status change.

### ✓ Dead Letter + Auto-Comment
When queue item exhausts retries, post comment on work item + set status='failed'. Surfaces failures to user.

### ✓ Per-Project Pipeline Config
JSONB toggle for auto-triage, auto-analyze, auto-implement, etc. Allows opt-in/opt-out per project without code changes.

### ✓ Complexity Routing
Simple/Medium/Complex field drives approval gates + phase skipping. Elegant UX: same flow, different gates.

---

## 8. What's Broken or Over-Engineered — DROP

### ✗ 14 Statuses + 7 Legacy Aliases
Go rewrite: use status ENUM with ~8 real states:
```
new, triaged, planned, approved, in_progress, in_review, released, closed
(+ side gates: wont_fix, blocked, on_hold)
No aliases. One source of truth.
```
Migration from v1: map old statuses on read, normalize on write.

### ✗ No DB-Level Transition Enforcement
Every endpoint can set any status. Chaos. Go: define state machine as CHECK constraint + FK to a status table.
```sql
CREATE TABLE status_enum (
  id INT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  category VARCHAR(20)  -- terminal | active | side_gate
);

CREATE TABLE work_items (
  ...
  status_id INT REFERENCES status_enum(id) NOT NULL,
  CHECK (transition_valid(status_id))  -- callable UDF
);
```

### ✗ Missing Auto-Trigger on Status Change
Pipeline orchestrator documented in CLAUDE.md does not exist. Implement in Go from day 1:
```go
func (s *WorkItemService) UpdateStatus(ctx context.Context, item *WorkItem, newStatus string) error {
  // 1. Validate transition
  // 2. Update DB
  // 3. Check if auto-trigger enabled (project config)
  // 4. Map status to phase (new→triage, triaged→analyze, etc.)
  // 5. Create AgentSession + enqueue QueueItem atomically (single transaction)
  return nil
}
```

### ✗ Manual Phase Orchestration
Current: user calls `bb agent suggest`, then `bb agent execute` separately.
Go: auto-trigger via orchestrator. Manual CLI override still available for power users.

### ✗ No Idempotency Keys
Same item+phase can be enqueued twice in race. Go: add idempotency_key field to queue_items.
```sql
CREATE TABLE queue_items (
  ...
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,  -- hash(work_item_id, phase, timestamp)
  ...
);
```

### ✗ current_load Race Condition
Two concurrent increments can exceed max_concurrent.
```python
# WRONG
device.current_load = min(device.current_load + 1, device.max_concurrent)
await db.commit()
```
Go: use ATOMIC compare-and-swap or semaphore per device.

### ✗ Dual CLI (Python + TypeScript)
Maintains two implementations of every command. Drift inevitable. Go rewrite: single CLI, no more dual maintenance.

### ✗ Dual Auth (JWT + X-BB-API-Key)
Every middleware checks both. Complexity without benefit. Go: JWT only. (Optional: API key as JWT issuer.)

### ✗ Knowledge Base as Stub
`rag_service.py` returns empty list. CLAUDE.md references "knowledge base" that doesn't exist.
Go: v1 doesn't have it either; punt to v4 if needed.

### ✗ Workflow DAG Incomplete
v2_workflow_runs table exists, but executor service not implemented (Phase 2, pending). For Phase 1 (task CRUD only): skip workflows. Implement in v3.

---

## 9. Simplifications Proposed for Go (Phase 1 Scope)

### 1. Status Enum + Transition Table
```go
type WorkItemStatus string
const (
  StatusNew        WorkItemStatus = "new"
  StatusTriaged    WorkItemStatus = "triaged"
  StatusPlanned    WorkItemStatus = "planned"
  StatusApproved   WorkItemStatus = "approved"
  StatusInProgress WorkItemStatus = "in_progress"
  StatusInReview   WorkItemStatus = "in_review"
  StatusReleased   WorkItemStatus = "released"
  StatusClosed     WorkItemStatus = "closed"
  StatusWontFix    WorkItemStatus = "wont_fix"
  StatusBlocked    WorkItemStatus = "blocked"
  StatusOnHold     WorkItemStatus = "on_hold"
)

type TransitionRule struct {
  From string
  To   []string
  // RequiredCommentType string (nullable)
}

var TransitionRules = map[string][]string{
  "new": {"triaged", "wont_fix", "blocked"},
  "triaged": {"planned", "new", "wont_fix"},
  // ...
}
```

### 2. Auto-trigger on Status Change
```go
func (s *WorkItemService) UpdateWorkItem(ctx context.Context, id int, updates *UpdateWorkItemReq) error {
  tx := s.db.BeginTx(ctx)
  defer tx.Rollback()
  
  // 1. Fetch current
  item, _ := s.GetWorkItem(ctx, id)
  
  // 2. Validate transition
  if err := ValidateTransition(item.Status, updates.Status); err != nil {
    return err
  }
  
  // 3. Update work_item
  item.Status = updates.Status
  item.UpdatedAt = time.Now()
  s.repo.Update(tx, item)
  
  // 4. Track change
  s.eventRepo.Create(tx, &WorkItemEvent{
    WorkItemID: id,
    EventType: "status_changed",
    FieldName: "status",
    OldValue: item.Status,
    NewValue: updates.Status,
  })
  
  // 5. Auto-trigger (if enabled in project config)
  if phase, ok := PhaseMapping[updates.Status]; ok {
    proj, _ := s.projectRepo.Get(ctx, item.ProjectID)
    if proj.PipelineConfig.IsEnabled && shouldAutoTrigger(proj, phase) {
      session := &AgentSession{
        WorkItemID: id,
        Phase: phase,
        Status: "pending",
      }
      s.sessionRepo.Create(tx, session)
      s.queueRepo.Enqueue(tx, &QueueItem{
        AgentSessionID: session.ID,
        Status: "queued",
        Priority: calculatePriority(item.Complexity),
      })
    }
  }
  
  return tx.Commit().Error
}
```

### 3. Idempotency via DB Unique Index
```sql
CREATE TABLE queue_items (
  id SERIAL PRIMARY KEY,
  agent_session_id INT NOT NULL REFERENCES agent_sessions(id),
  idempotency_key VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'queued',
  locked_by_device_id INT REFERENCES devices(id),
  locked_at TIMESTAMP,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(idempotency_key),
  UNIQUE(agent_session_id)
);

-- Idempotency key format: SHA256(work_item_id + phase + timestamp_of_status_change)
```

### 4. Lease-Based Queue Lock with Reaper
```go
// Worker heartbeat every 30s; lease is 60s
func (s *QueueService) Dequeue(ctx context.Context, deviceID int) (*QueueItem, error) {
  tx := s.db.BeginTx(ctx)
  result := tx.Raw(`
    SELECT * FROM queue_items
    WHERE status = 'queued'
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `).Scan(&item)
  
  item.Status = "locked"
  item.LockedByDeviceID = &deviceID
  item.LockedAt = time.Now().Add(60 * time.Second)  // lease end time
  item.Attempts++
  tx.Save(item)
  return item, tx.Commit().Error
}

// Background reaper: every 30s, unlock items with expired leases
func (s *QueueService) ReleaseStaleItems(ctx context.Context) error {
  return s.db.Model(&QueueItem{}).
    Where("status = ? AND locked_at < ?", "locked", time.Now()).
    Update("status", "queued").
    Update("locked_by_device_id", nil).
    Update("locked_at", nil).
    Error
}
```

### 5. Atomic Load Management
```go
// Instead of: device.current_load++, use semaphore
type DevicePool struct {
  devices map[int]*Device
  semaphores map[int]*semaphore.Weighted  // per-device
}

func (p *DevicePool) ClaimSlot(ctx context.Context, deviceID int) error {
  sema := p.semaphores[deviceID]
  // Blocks if max_concurrent slots in use
  return sema.Acquire(ctx, 1)
}

func (p *DevicePool) ReleaseSlot(deviceID int) {
  sema := p.semaphores[deviceID]
  sema.Release(1)
}
```

### 6. Drop Workflow Executor (Phase 1)
No workflow_runs logic in Phase 1. Pure task management.
Phase 3 adds workflow orchestrator + node executors.

### 7. One CLI, One Auth
- CLI: Go, single source of truth
- Auth: JWT only (via /auth/login → access token)
- Optional: API key as JWT issuer (for CI/CD), issue via POST /auth/api-key

---

## 10. Migration Considerations

### Data Migration Plan
```
Freeze v1 at tag legacy/v0.13-pre-v2 (already done)

For v2 rebuild (Phase 1 task management only):
1. Keep users table (or shallow copy for JWT auth)
2. Create fresh work_items table (with status ENUM)
3. NO import of v1 work items (breaking change by design)
4. New projects created in v2 only
5. Legacy v1 read-only (no new changes)
6. Cutover plan: TBD (separate runbook)
```

### Schema Differences v1→v2 (conceptual)
| Aspect | v1 | v2 (proposed) |
|--------|-----|---------|
| Status | VARCHAR(50) + aliases | ENUM (PostgreSQL type or FK to status table) |
| Transitions | App logic only | DB CHECK constraint |
| Auto-trigger | Not implemented | Built-in on status change |
| Queue idempotency | App level | DB unique(idempotency_key) |
| Device load | non-atomic int | Semaphore-based |
| Workflows | Planned (Phase 2) | Deferred to Phase 3 |

---

## 11. Open Questions

1. **Multi-AI runners**: v1 hardcodes Claude. v2 plans soft multi-model via `agent_definitions` table. Should Go rewrite support role-based model selection from day 1? (Cost: ~2 days.)
   
2. **Knowledge base**: CLAUDE.md repeatedly references "knowledge base" that doesn't exist. Should Go implement a `knowledge_base` table + CRUD endpoints + embedding search? Or stay stub? (Cost: 5+ days if real.)

3. **Execution lock semantics**: Current v1 execution_lock is JSONB + manual check. Should Go use advisory locks (`SELECT pg_advisory_lock()`) for higher assurance? (Cost: 1 day, higher safety.)

4. **Workflow executor timeline**: Phase 1 scope excludes workflows. When should Phase 3 start? (Blocks downstream: CLI agent commands assume phase routing.)

5. **Legacy status aliases**: Data migration from v1 — should Phase 1 accept old statuses on input (for API compatibility) and normalize? Or strict enum from day 1? (Cost: 1 day if support legacy.)

6. **MCP orchestration tools**: v1 MCP only exposes CRUD. Should Go add `task_run`, `task_advance`, streaming support from day 1? (Cost: 5+ days, enables Claude Code automation.)

---

## 12. Summary: What to Keep, What to Drop

### KEEP (Proven patterns)
- SKIP LOCKED queue dequeue
- Event tracking (per-field change history)
- Device heartbeat + offline detection
- Session context persistence (JSONB multi-phase)
- Dead letter + auto-comment
- Complexity-driven routing
- Per-project pipeline config toggles

### DROP (Complexity/debt)
- 14 statuses + 7 legacy aliases → 8-11 clean enums
- No DB transition enforcement → CHECK constraints
- Missing auto-trigger orchestrator → implement from day 1
- Dual CLI (Python + TypeScript) → single Go CLI
- Dual auth (JWT + API key) → JWT only
- Knowledge base as stub → skip Phase 1
- Workflow executor (incomplete v2) → defer Phase 3
- non-atomic current_load → semaphore-based

### SIMPLIFY (Go rewrite advantage)
- Idempotency keys: add DB unique constraint from day 1
- Lease-based locking: replace polling heartbeat with explicit lease end time + reaper
- Atomic load: semaphores vs. non-atomic int
- Single language: eliminate Python↔TypeScript sync pain

---

**Status:** DONE

**Key finding:** v1 has working queue + device pool, but missing the core auto-trigger orchestrator. Go rewrite should implement this from day 1. Keep the queue protocol (SKIP LOCKED is gold), drop the status chaos (14 + 7 = 21 possible states is unmaintainable), and simplify device load management via semaphores.
