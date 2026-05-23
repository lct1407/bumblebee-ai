---
name: BB Full Pipeline & WebSocket Upgrade
status: completed
created: 2026-04-01
phases: 4
estimated_effort: 15-20 days
blockedBy: []
blocks: []
---

# Bumblebee Full Pipeline & WebSocket Upgrade

4-phase upgrade: WebSocket fix → Complexity routing → Review phase → Deploy pipeline.

## Phase 1: WebSocket Fix & Upgrade (3-5 days)

**Why first:** Stale event names = broken cache invalidation. Foundation for all streaming.

### 1.1 Fix Stale Event Names (Critical Bug)

**File:** `web/src/hooks/use-websocket.ts`

Server emits `work_item:created`, `work_item:updated`, `work_item:deleted`, `work_item:bulk_updated`.
Client listens for `story:created`, `story:updated`, `story:deleted`, `task:created`, `task:updated`.
Cache invalidation never fires for work items.

**Change:**
```ts
// BEFORE (broken)
wsManager.on("story:created", () => qc.invalidateQueries({ queryKey: ["stories"] })),
wsManager.on("task:created", () => qc.invalidateQueries({ queryKey: ["tasks"] })),

// AFTER (fixed)
wsManager.on("work_item:created", () => qc.invalidateQueries({ queryKey: ["work-items"] })),
wsManager.on("work_item:updated", () => qc.invalidateQueries({ queryKey: ["work-items"] })),
wsManager.on("work_item:deleted", () => qc.invalidateQueries({ queryKey: ["work-items"] })),
wsManager.on("work_item:bulk_updated", () => qc.invalidateQueries({ queryKey: ["work-items"] })),
```

Also verify the actual queryKey used in work item fetching hooks to ensure invalidation hits the right cache. Search `web/src/` for `queryKey:.*work` to confirm.

### 1.2 Session-Targeted WebSocket Channels

**Server — `api/src/websocket/manager.py`:**

Add `session_subscriptions: dict[str, set[WebSocket]]` to `ConnectionManager`.

Add methods:
- `handle_client_message(ws, raw_text)` — parse JSON, handle `subscribe`/`unsubscribe` by `session_id`
- `send_to_session(session_id, event, data)` — send only to subscribed clients
- `wait_for_subscriber(session_id, timeout_ms=5000)` — poll until subscriber joins
- On `disconnect()`, clean up session subscriptions too

**Server — `api/src/main.py`:**

Change WS endpoint from discarding messages to parsing them:

```python
# BEFORE
while True:
    await websocket.receive_text()

# AFTER
while True:
    raw = await websocket.receive_text()
    await ws_manager.handle_client_message(websocket, raw)
```

**Update relay endpoints** (`api/src/routes/agent_sessions.py`):

Where `agent:output` is broadcast, change to `send_to_session()` for session-scoped events:
- `agent:output` → `send_to_session`
- `agent:phase_change` → `send_to_session`
- `agent:completed` → both `send_to_session` AND `broadcast` (for cache invalidation)
- `agent:failed` → both `send_to_session` AND `broadcast`

Keep broadcasts for: `work_item:*`, `device:*`, `queue:*`, `cost:*`, `agent:spawn_request`.

**Client — `web/src/hooks/use-agent-stream.ts`:**

Send `subscribe` message on mount, `unsubscribe` on cleanup:

```ts
useEffect(() => {
  if (!sessionId) return;
  wsManager.send({ type: "subscribe", session_id: sessionId });
  // ... existing event handlers (remove client-side session_id filter)
  return () => {
    wsManager.send({ type: "unsubscribe", session_id: sessionId });
  };
}, [sessionId]);
```

**Client — `web/src/lib/websocket.ts`:**

Add `send(data)` method to `WSManager`:
```ts
send(data: Record<string, unknown>) {
  if (this.ws?.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify(data));
  }
}
```

### 1.3 Exponential Backoff Reconnect

**File:** `web/src/lib/websocket.ts`

```ts
// Add to WSManager class
private retryCount = 0;
private static MAX_RETRIES = 10;
private static BASE_DELAY = 1000;

// In onclose handler:
ws.onclose = () => {
  if (this.retryCount >= WSManager.MAX_RETRIES) return;
  const delay = Math.min(WSManager.BASE_DELAY * 2 ** this.retryCount, 30_000);
  this.retryCount++;
  this.reconnectTimer = setTimeout(() => this.connect(this.projectSlug || undefined), delay);
};

// In onopen (reset on success):
// this.retryCount = 0;
```

### 1.4 Polling Fallback

**File:** `web/src/hooks/use-agent-stream.ts`

Add 15s polling when streaming is active:

```ts
useEffect(() => {
  if (!sessionId || phase === "idle") return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${API_URL}/api/agent-sessions/${sessionId}`);
      const session = await res.json();
      if (session.status !== "running" && session.status !== "pending") {
        setPhase("idle");
      }
    } catch {}
  }, 15_000);
  return () => clearInterval(interval);
}, [sessionId, phase]);
```

### 1.5 Server-Side Ping/Pong

**File:** `api/src/websocket/manager.py`

Add background task that pings all connections every 30s.
Mark connections as dead if no pong within 10s.

```python
import asyncio

async def _ping_loop(self):
    while True:
        await asyncio.sleep(30)
        for key, conns in list(self._connections.items()):
            dead = []
            for ws in conns:
                try:
                    await asyncio.wait_for(ws.send_json({"event": "ping"}), timeout=10)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(ws, key if key != "__global__" else None)
```

Start this in `main.py` as a background task on startup.

### 1.6 Files Changed

| File | Change |
|------|--------|
| `web/src/hooks/use-websocket.ts` | Fix event names, add new WS events |
| `web/src/hooks/use-agent-stream.ts` | Subscribe/unsubscribe, remove client filter, polling fallback |
| `web/src/lib/websocket.ts` | Add `send()`, exponential backoff, retry limit, reset on open |
| `api/src/websocket/manager.py` | Session subscriptions, `send_to_session`, `wait_for_subscriber`, ping loop |
| `api/src/main.py` | Parse WS messages instead of discarding |
| `api/src/routes/agent_sessions.py` | Use `send_to_session` for session-scoped events |

---

## Phase 2: Complexity Routing (3-4 days)

### 2.1 Add `complexity` Field to WorkItem

**File:** `api/src/models/work_item.py`

```python
complexity: Mapped[str | None] = mapped_column(String(20))  # Simple/Medium/Complex
```

**Migration:** `alembic revision --autogenerate -m "add complexity to work_items"`

### 2.2 Update Schemas

**File:** `api/src/schemas/work_item.py`

Add `complexity` to `WorkItemResponse`, `WorkItemCreate`, `WorkItemUpdate` schemas.
Validate: `Literal["Simple", "Medium", "Complex"] | None`

### 2.3 Complexity Routing Config

**File:** `api/src/services/pipeline_orchestrator.py`

Add routing config:

```python
COMPLEXITY_ROUTING = {
    "Simple": {
        "auto_approve_plan": True,
        "review_mode": "self",
        "skip_developed": True,
        "auto_staging": True,
    },
    "Medium": {
        "auto_approve_plan": True,
        "review_mode": "quick",
        "skip_developed": True,
        "auto_staging": True,
    },
    "Complex": {
        "auto_approve_plan": False,
        "review_mode": "full",
        "skip_developed": False,
        "auto_staging": False,
    },
}
```

### 2.4 Update `on_status_change()` for Complexity

Key routing points:

1. **`planned` status**: If Simple/Medium → auto-promote to `approved` (skip human gate)
2. **`in_review` status**: If Complex → route to `developed` (for review), else straight to next step

```python
# In on_status_change(), after determining skill:
complexity = item.complexity or "Medium"  # default Medium
routing = COMPLEXITY_ROUTING.get(complexity, COMPLEXITY_ROUTING["Medium"])

# Auto-approve plan for Simple/Medium
if to_status == "planned" and routing["auto_approve_plan"]:
    item.status = "approved"
    await db.commit()
    return await on_status_change(db, item_id, "planned", "approved", project)
```

### 2.5 Update Lifecycle Transitions

**File:** `api/src/services/lifecycle_service.py`

Add new transitions to `_UNIFIED_TRANSITIONS`:
```python
"planned": ["approved", "new", "triaged", "wont_fix", "needs_info"],
# No change needed — planned → approved already allowed
```

### 2.6 Update Triage Agent Prompt

The triage phase prompt needs to classify complexity. Add to the triage skill template:

```
Classify complexity:
- Simple: single file change, no schema changes, isolated fix
- Medium: 2-5 files, same module, no cross-cutting concerns
- Complex: 6+ files, cross-module, schema/migration, security implications

Set complexity field in the work item update.
```

### 2.7 Frontend: Complexity Badge

**File:** `web/src/components/work-items/` (wherever item cards/rows render)

Show colored badge: Simple (green), Medium (yellow), Complex (red).
Add complexity filter to filter bar.

### 2.8 Files Changed

| File | Change |
|------|--------|
| `api/src/models/work_item.py` | Add `complexity` column |
| `api/src/schemas/work_item.py` | Add `complexity` to schemas |
| `api/src/services/pipeline_orchestrator.py` | Add `COMPLEXITY_ROUTING`, modify `on_status_change` |
| `api/alembic/versions/xxx_add_complexity.py` | Migration |
| `web/src/lib/pipeline-types.ts` | Add complexity type |
| `web/src/components/work-items/shared/` | Complexity badge + filter |
| CLI triage prompt template | Classify complexity |

---

## Phase 3: Review Phase + Reopen Flow (3-4 days)

### 3.1 Add New Statuses

**File:** `api/src/services/lifecycle_service.py`

Add to `_UNIFIED_TRANSITIONS`:

```python
"developed": ["deploying", "reopen", "needs_info"],    # Complex: after code push
"reopen": ["in_progress", "new", "wont_fix"],           # Rejection → fix cycle
```

Update existing:
```python
"in_review": ["done", "in_progress", "failed", "developed"],  # add developed
"in_progress": ["in_review", "developed", "failed", "needs_info", "blocked"],  # add developed
```

### 3.2 Add New Agent Phases

**File:** `api/src/services/pipeline_orchestrator.py`

```python
PIPELINE_SKILLS["developed"] = "review"
PIPELINE_SKILLS["reopen"] = "fix"
```

**File:** `web/src/lib/pipeline-types.ts`

Add to `AGENT_PHASES`:
```ts
{ value: "review", label: "Review" },
{ value: "fix", label: "Fix" },
```

Add to `WORK_ITEM_STATUSES`: `"developed"`, `"reopen"`

Add to `DEFAULT_PIPELINE_STAGES`:
```ts
{
  id: "review",
  name: "Review",
  description: "Independent code review (Complex items)",
  status_from: "developed",
  status_to: "deploying",  // or "reopen" on failure
  agent_phase: "review",
  runner: "cli",
  model: "claude-sonnet-4-6",
  auto: true,
  sort_order: 3.5,  // between test and merge
  enabled: true,
},
{
  id: "fix",
  name: "Fix",
  description: "Auto-fix rejected code on feature branch",
  status_from: "reopen",
  status_to: "developed",  // or deploying for Simple/Medium
  agent_phase: "fix",
  runner: "cli",
  model: "claude-sonnet-4-6",
  auto: true,
  sort_order: 4.5,
  enabled: true,
},
```

### 3.3 Complexity-Based Review Routing

In `on_status_change()`, when item enters `in_review`:

```python
if to_status == "in_review":
    complexity = item.complexity or "Medium"
    if complexity == "Complex":
        # Route to developed → independent review
        item.status = "developed"
        await db.commit()
        return await on_status_change(db, item_id, "in_review", "developed", project)
    # Simple/Medium: continue to existing merge/deploy flow
```

### 3.4 Reopen Cycle Protection

**File:** `api/src/services/pipeline_orchestrator.py`

```python
MAX_REOPEN_CYCLES = 5

# In on_status_change(), before triggering "fix":
if skill == "fix":
    fix_count = await _count_sessions(db, item_id, "fix")
    if fix_count >= MAX_REOPEN_CYCLES:
        logger.warning("Pipeline: reopen cycle limit reached for item %s (%d/%d)", item_id, fix_count, MAX_REOPEN_CYCLES)
        # Post comment explaining escalation
        return False
```

### 3.5 Review Agent Phase

The review agent runs with fresh context (no session continuity from implement):
- Reads the git diff on the feature branch
- Checks against CLAUDE.md rules, coding standards, security patterns
- Posts comment with verdict: `APPROVE`, `REQUEST_CHANGES`, `ESCALATE`
- On APPROVE → status transitions to next step (deploying or merge)
- On REQUEST_CHANGES → status transitions to `reopen`
- On ESCALATE → status transitions to `needs_info`

### 3.6 Pipeline Config Additions

Add to `projects.pipeline_config`:
```json
{
  "auto_review": true,
  "auto_fix": { "enabled": true, "max_cycles": 5 }
}
```

### 3.7 Files Changed

| File | Change |
|------|--------|
| `api/src/services/lifecycle_service.py` | Add `developed`, `reopen` transitions |
| `api/src/services/pipeline_orchestrator.py` | Add `review`/`fix` skills, complexity routing at `in_review`, reopen protection |
| `web/src/lib/pipeline-types.ts` | Add statuses, phases, stages |
| `api/src/services/agent_session_service.py` | Phase→status sync for `review`/`fix` |
| CLI agent commands | Add `bb agent review`, `bb agent fix` |
| Frontend pipeline progress | Show review/fix steps |

---

## Phase 4: Deploy Pipeline (5-7 days)

### 4.1 Add Deploy Statuses

**File:** `api/src/services/lifecycle_service.py`

Add to `_UNIFIED_TRANSITIONS`:

```python
"deploying": ["testing", "reopen", "on_hold"],      # deploy success/CI fail/infra fail
"testing": ["staging", "reopen"],                     # QA pass/fail
"staging": ["released", "reopen"],                    # human approve/reject
"released": ["closed"],                               # release complete
"closed": ["new"],                                    # reopen
"on_hold": ["deploying", "new", "reopen"],           # resume/reopen
```

Update existing:
```python
"in_review": ["done", "in_progress", "failed", "developed", "deploying"],  # add deploying
"done": ["new"],  # keep for backward compat, but closed is the new terminal
```

### 4.2 Add Deploy Agent Phases

**File:** `api/src/services/pipeline_orchestrator.py`

```python
PIPELINE_SKILLS.update({
    "deploying": "deploy",       # merge to release/dev + trigger Coolify
    "testing": "qa_test",        # run QA against staging
    "released": "release",       # squash merge to master + prod deploy
    "on_hold": None,             # human intervention
    "staging": None,             # human gate (Complex) or auto-skip (Simple/Med)
    "closed": None,
})
```

### 4.3 Deploy Config in Pipeline

**File:** `api/src/models/project.py` — no model change needed (JSONB field).

Extend `pipeline_config` schema:

```json
{
  "enabled": true,
  "auto_triage": true,
  "auto_analyze": true,
  "auto_implement": false,
  "auto_test": true,
  "auto_reimplement": { "enabled": true, "max_retries": 3 },
  "auto_review": true,
  "auto_fix": { "enabled": true, "max_cycles": 5 },
  "auto_deploy": true,
  "auto_qa": true,
  "auto_release": false,
  "deploy_config": {
    "coolify_url": "https://manage.example.com",
    "coolify_api_key": "***",
    "resources": [
      { "name": "api", "uuid": "abc123" },
      { "name": "web", "uuid": "def456" }
    ],
    "staging_url": "https://staging.example.com",
    "staging_api_url": "https://staging-api.example.com",
    "test_credentials": [
      { "label": "Admin", "username": "admin@test.com", "password": "***" }
    ]
  }
}
```

### 4.4 Coolify Deploy Service

**New file:** `api/src/services/coolify_service.py`

REST client for Coolify API:
- `deploy(resource_uuid)` — trigger deploy
- `get_status(resource_uuid)` — check deploy status
- `get_logs(resource_uuid)` — fetch deploy logs
- `cancel(resource_uuid)` — cancel running deploy

Used by the `deploy` agent phase and by auto-transition logic.

### 4.5 Deploy Agent Phase

Merge to `release/dev` + trigger Coolify:
1. `git merge feat/bb-XX` into `release/dev`
2. Push `release/dev`
3. Call `coolify_service.deploy(resource_uuid)` for each resource
4. Poll status until complete or timeout (15 min)
5. On success → update status to `testing`
6. On CI fail → update status to `reopen` + post comment with error
7. On server fail → retry 1-2x → `on_hold` if still failing

### 4.6 QA Test Agent Phase

Run QA against staging URL:
1. Read `deploy_config.staging_url` and `test_credentials`
2. Run Playwright tests against staging (if configured)
3. Run API tests against `staging_api_url`
4. On pass → `staging` (Complex: human gate) or `released` (Simple/Med: auto-skip)
5. On fail → `reopen` + post test report

### 4.7 Release Agent Phase

Squash merge to production + deploy:
1. `git checkout master`
2. `git merge --squash feat/bb-XX`
3. `git push origin master`
4. Coolify deploy triggers via GitHub webhook (existing `deploy.yml`)
5. Verify prod health
6. Update status to `closed`
7. Clean up worktree + branch

### 4.8 Staging Auto-Skip for Simple/Medium

In `on_status_change()`:

```python
if to_status == "staging":
    complexity = item.complexity or "Medium"
    routing = COMPLEXITY_ROUTING.get(complexity, COMPLEXITY_ROUTING["Medium"])
    if routing["auto_staging"]:
        item.status = "released"
        await db.commit()
        return await on_status_change(db, item_id, "staging", "released", project)
```

### 4.9 Deploy Failure Handling

Add deploy timeout checker (similar to existing session timeout):

```python
async def deploy_timeout_checker():
    """Background task: fail deploys stuck > 15 min."""
    while True:
        await asyncio.sleep(120)
        # Find items in "deploying" > 15 min
        # Transition to "on_hold" with comment
```

### 4.10 Frontend: Pipeline Progress Update

**File:** `web/src/components/agent/pipeline-progress.tsx`

Update horizontal step indicator to show full pipeline:
```
triage → analyze → [approve] → implement → test → [review] → deploy → QA → [staging] → release
```

Steps in brackets are human gates (shown differently for Complex items).

### 4.11 Frontend: Deploy Status Panel

New component showing:
- Current deploy status (deploying/testing/staging/released)
- Deploy logs (streamed via WS)
- Staging URL link
- Approve/reject buttons for staging gate

### 4.12 Update DEFAULT_PIPELINE_STAGES

**File:** `web/src/lib/pipeline-types.ts`

Add stages for deploy, qa, release with appropriate sort_order.

### 4.13 Files Changed

| File | Change |
|------|--------|
| `api/src/services/lifecycle_service.py` | Add deploy statuses + transitions |
| `api/src/services/pipeline_orchestrator.py` | Add deploy/qa/release skills, staging auto-skip |
| `api/src/services/coolify_service.py` | **New** — Coolify REST client |
| `api/src/services/agent_session_service.py` | Phase→status sync for deploy/qa/release |
| `web/src/lib/pipeline-types.ts` | Add statuses, phases, stages |
| `web/src/components/agent/pipeline-progress.tsx` | Full pipeline visualization |
| `web/src/components/agent/deploy-status-panel.tsx` | **New** — deploy tracking UI |
| `web/src/components/agent/staging-approval.tsx` | **New** — staging gate UI |
| CLI agent commands | Add `bb agent deploy`, `bb agent qa`, `bb agent release` |
| Pipeline settings page | Add deploy config form |

---

## Cross-Phase Dependencies

```
Phase 1 (WebSocket) ← no deps, can start immediately
Phase 2 (Complexity) ← no deps on Phase 1, but should go after for clean PRs
Phase 3 (Review) ← depends on Phase 2 (complexity routing determines review path)
Phase 4 (Deploy) ← depends on Phase 3 (review feeds into deploy, reopen feeds into fix)
```

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Stale event names already broken | Phase 1.1 is a standalone fix, can ship immediately |
| Status explosion confuses users | Simple items auto-skip most statuses; UI shows simplified view |
| WS upgrade breaks streaming mid-session | Keep `broadcast()` as fallback; `send_to_session` is additive |
| Coolify API changes | Wrap in service layer; health check on startup |
| Migration breaks existing data | All new statuses are additive; old statuses still valid via legacy aliases |
| Complexity misclassification | Manual override via UI; default to Medium (safe middle ground) |

## Validation Criteria

- [ ] Phase 1: WS events reach client, session stream works without client-side filter
- [ ] Phase 2: Triage sets complexity, Simple items auto-approve plans
- [ ] Phase 3: Complex items go through review, reopen cycle stops at 5
- [ ] Phase 4: Full deploy loop works for at least one project with Coolify
- [ ] All phases: Existing pipeline (triage→analyze→implement→test→merge) still works unchanged
