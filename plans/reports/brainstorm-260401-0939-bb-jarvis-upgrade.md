# Brainstorm: Bumblebee Full Pipeline & WebSocket Upgrade

**Date:** 2026-04-01
**Status:** Draft — awaiting approval
**Scope:** 4 major upgrades inspired by Jarvis architecture

---

## Problem Statement

Bumblebee pipeline stops at `merge → done` — no deploy tracking, no staging QA, no complexity routing. WebSocket broadcasts everything to all clients with stale event names. No independent code review step. These gaps limit full automation and observability.

## Current State vs Target

| Area | BB Now | BB Target (Jarvis-inspired) |
|------|--------|---------------------------|
| Pipeline end | `in_review → done` | `in_review → deploying → testing → staging → released → closed` |
| Complexity | All items same flow | Simple/Medium/Complex with routing |
| WebSocket | Broadcast-all, stale events | Session-targeted + fixes |
| Code review | Self-review in implement | Independent review phase for Complex |

---

## Upgrade 1: Deploy Pipeline (Full)

### New Statuses

| Status | Meaning | Trigger |
|--------|---------|---------|
| `deploying` | CI/deploy running | Test pass (auto) or merge complete |
| `testing` | QA against staging | Deploy success (auto-transition) |
| `staging` | Human final check | QA pass |
| `released` | Approved for prod | Human confirms staging |
| `closed` | Archived | Release complete |

### New Pipeline Stages

```
existing: triage → analyze → implement → test → fix
new:      review → merge → deploy → qa → release
```

| Stage | status_from | status_to | agent_phase | auto |
|-------|-------------|-----------|-------------|------|
| review | in_review | developed/deploying | review | true (Complex only) |
| merge | developed→deploying OR in_review→deploying | deploying | merge | false |
| deploy | deploying | testing | deploy | true |
| qa | testing | staging | qa_test | true |
| release | released | closed | release | false |

### Deploy Integration

- Add `deploy` agent phase — triggers Coolify deploy via REST API
- Store Coolify resource UUIDs in `projects.pipeline_config.deploy_config`
- Track deploy status: poll Coolify API or receive webhook
- `deploying → testing` auto-transition on deploy success

### Deploy Failure Handling

| Failure | Cause | Status | Handler |
|---------|-------|--------|---------|
| CI pipeline failed | Code doesn't build | `reopen` | Auto-fix agent |
| Server deploy failed | Infra issue | `on_hold` (new status) | Human/ops |
| Deploy stuck >15min | Unknown hang | `on_hold` | Human/ops |

### New Status: `on_hold`

Add `on_hold` status for infra failures and manual blocks. Different from `blocked` (which is task-level dependency). `on_hold` = system-level issue requiring ops intervention.

### DB Migration Required

```python
# work_items table
# Extend status enum: add 'deploying', 'testing', 'staging', 'released', 'closed', 'on_hold', 'reopen', 'developed'
# Note: status is String(20) not enum, so just update validation

# projects.pipeline_config additions:
# deploy_config: { coolify_url, coolify_api_key, resources: [{name, uuid}] }
# staging_url, staging_api_url
# test_credentials: [{label, username, password}]
# auto_review, auto_deploy, auto_qa, auto_release toggles
```

### Branching Model Enhancement

Current: feature branch → `release/dev` → `master`
Target: keep ISS-* branch alive through pipeline

```
feat/bb-42 ──merge──▶ release/dev (staging) ──▶ staging env for QA
                │
                └─── at released ──squash merge──▶ master (production)
```

Key rule: never merge `release/dev → master` directly. Each item reaches production via its own feature branch squash-merge.

---

## Upgrade 2: Complexity Routing (3-tier)

### Classification

Add `complexity` field to WorkItem model: `Simple | Medium | Complex`

Triage agent classifies based on:
- Number of files likely affected
- Cross-module changes
- Schema/migration changes
- Security implications
- Test coverage needed

### Routing Rules

| Aspect | Simple | Medium | Complex |
|--------|--------|--------|---------|
| Plan approval | Auto-approve | Auto-approve | Human gate (`planned` → wait) |
| Code review | Self-review (in implement) | Quick review (bug-severity) | Full independent review agent |
| Deploy path | Merge to release/dev → deploy | Merge to release/dev → deploy | Push branch → forge-review → merge → deploy |
| Staging gate | Auto-skip | Auto-skip | Human approval required |

### Pipeline Behavior Changes

```python
COMPLEXITY_ROUTING = {
    "Simple": {
        "auto_approve_plan": True,
        "review_mode": "self",        # review inside implement
        "skip_developed": True,        # no separate review step
        "auto_staging": True,          # skip human staging gate
    },
    "Medium": {
        "auto_approve_plan": True,
        "review_mode": "quick",        # quick review agent
        "skip_developed": True,
        "auto_staging": True,
    },
    "Complex": {
        "auto_approve_plan": False,    # human gate at planned
        "review_mode": "full",         # independent review agent
        "skip_developed": False,       # goes through developed status
        "auto_staging": False,         # human gate at staging
    },
}
```

### Impact on Pipeline Orchestrator

`on_status_change()` needs to check `work_item.complexity` before dispatching:
- `planned` status: auto-promote to `approved` if Simple/Medium, wait for human if Complex
- `in_review` status: route to `deploying` (Simple/Medium) or `developed` (Complex)
- `staging` status: auto-promote to `released` (Simple/Medium) or wait (Complex)

---

## Upgrade 3: WebSocket Full Upgrade

### 3a. Fix Stale Event Names (Critical Bug)

`web/src/hooks/use-websocket.ts` listens for `story:created`, `task:created` — server emits `work_item:created`. Fix event name mapping.

### 3b. Session-Targeted Channels

**Server (`api/src/websocket/manager.py`):**

```python
class ConnectionManager:
    connections: dict[str, list[WebSocket]]          # project_slug → ws[]
    session_subscriptions: dict[str, set[WebSocket]]  # session_id → ws set

    async def handle_message(self, ws, data):
        if data.get("type") == "subscribe" and data.get("session_id"):
            subs = self.session_subscriptions.setdefault(data["session_id"], set())
            subs.add(ws)
        elif data.get("type") == "unsubscribe" and data.get("session_id"):
            self.session_subscriptions.get(data["session_id"], set()).discard(ws)

    async def send_to_session(self, session_id, event, data):
        subs = self.session_subscriptions.get(session_id, set())
        msg = json.dumps({"event": event, "data": data})
        for ws in list(subs):
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_text(msg)

    async def wait_for_subscriber(self, session_id, timeout_ms=5000):
        # Poll until at least one subscriber joins
        elapsed = 0
        while elapsed < timeout_ms:
            if self.session_subscriptions.get(session_id):
                return True
            await asyncio.sleep(0.1)
            elapsed += 100
        return False
```

**Client:**
- `use-agent-stream.ts`: send `subscribe` message instead of client-side filtering
- Remove client-side `session_id` filter logic

### 3c. Exponential Backoff Reconnect

Replace fixed 3s reconnect with:
```
delay = min(BASE_DELAY * 2^retryCount, 30_000)  # 1s → 2s → 4s → ... → 30s cap
max_retries = 10
```

### 3d. Polling Fallback

Add 15s polling interval in `use-agent-stream.ts`:
```ts
useEffect(() => {
  if (!isStreaming || !sessionId) return;
  const interval = setInterval(async () => {
    const session = await api.getSession(sessionId);
    if (session.status !== 'running') {
      finalize();
    }
  }, 15000);
  return () => clearInterval(interval);
}, [isStreaming, sessionId]);
```

### 3e. Connection Cleanup

Server-side ping/pong (30s interval) to detect dead connections — Jarvis does this, BB doesn't.

---

## Upgrade 4: Independent Code Review Phase

### New Agent Phase: `review`

- Triggers at `in_review` status for Complex items
- Runs with **fresh context** (new agent session, no carryover from implement)
- Reviews diff against: coding standards, CLAUDE.md rules, security, test coverage
- Verdict: `APPROVE` → `deploying`, `REQUEST_CHANGES` → `reopen`, `ESCALATE` → `needs_info`

### New Status: `developed`

Only used for Complex items. After `forge-code` pushes:
- Complex → `developed` → review agent → `deploying` (pass) or `reopen` (fail)
- Simple/Medium → skip `developed`, go straight to `deploying`

### Pipeline Orchestrator Addition

```python
PIPELINE_SKILLS["developed"] = "review"  # Complex only
PIPELINE_SKILLS["reopen"] = "fix"        # New: auto-fix on rejection
```

### Reopen Cycle Protection

Track `reopen → fix → developed/deploying` cycles per item. After 5 cycles, stop auto-fix and keep at `reopen` for human review.

```python
# In pipeline_orchestrator.py
MAX_REOPEN_CYCLES = 5

async def _check_reopen_limit(self, work_item_id):
    cycles = await count_sessions(work_item_id, phase="fix")
    return cycles < MAX_REOPEN_CYCLES
```

---

## Full Pipeline Diagram (Target State)

```
                        ┌──────────────────────────────────────────────┐
                        │              HAPPY PATH                      │
  ┌─────┐  triage  ┌────────┐  analyze  ┌────────┐  human  ┌────────┐│
  │ new │────────▶│ triaged │────────▶│ planned │───────▶│approved││
  └─────┘          └────────┘          │(Complex)│        └───┬────┘│
                                        └────────┘            │     │
                              Simple/Medium: auto-approve ────┘     │
                                                                    │
                                          implement                 │
                                              │                     │
                                     ┌────────▼────────┐            │
                                     │  in_progress     │            │
                                     │ 1. implement     │            │
                                     │ 2. self/quick    │            │
                                     │    review        │            │
                                     │ 3. commit+push   │            │
                                     └────────┬────────┘            │
                                              │                     │
                               ┌──────────────┼──────────────┐      │
                               │              │              │      │
                         Complex         Simple/Med                 │
                               │              │                     │
                        ┌──────▼──────┐       │                     │
                        │  developed  │       │                     │
                        └──────┬──────┘       │                     │
                               │              │                     │
                         review agent         │                     │
                               │              │                     │
                        ┌──────┴──────┐       │                     │
                     pass          fail       │                     │
                        │             │       │                     │
                        │      ┌──────▼──┐    │                     │
                        │      │ reopen  │    │                     │
                        │      └─────────┘    │                     │
                        │                     │                     │
                 ┌──────▼──────┐              │                     │
                 │  deploying  │◀─────────────┘                     │
                 └──────┬──────┘                                    │
                        │                                           │
                   deploy success / CI fail                         │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │   testing   │  (QA against staging)              │
                 └──────┬──────┘                                    │
                        │                                           │
                   qa pass / fail                                   │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │   staging   │  (Complex: human gate)             │
                 └──────┬──────┘  (Simple/Med: auto-skip)          │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │  released   │                                    │
                 └──────┬──────┘                                    │
                        │                                           │
                   squash merge → master → Coolify deploy           │
                        │                                           │
                 ┌──────▼──────┐                                    │
                 │   closed    │                                    │
                 └─────────────┘                                    │
                                                                    │
  EXCEPTIONS (from any active state):                               │
  ┌──────────┐  ┌────────────┐  ┌─────────┐                        │
  │ on_hold  │  │ needs_info │  │ blocked │                        │
  └──────────┘  └────────────┘  └─────────┘                        │
```

---

## Implementation Phases

### Phase 1: WebSocket Fix & Upgrade (3-5 days)
**Why first:** Stale event names = broken cache invalidation RIGHT NOW. Foundation for all streaming.

1. Fix stale event names in `use-websocket.ts`
2. Add session subscriptions to `ConnectionManager`
3. Add `send_to_session()` + `wait_for_subscriber()`
4. Exponential backoff reconnect
5. Polling fallback in `use-agent-stream.ts`
6. Server-side ping/pong cleanup

### Phase 2: Complexity Field + Routing (3-4 days)
**Why second:** Affects all downstream pipeline behavior.

1. Add `complexity` field to WorkItem model + migration
2. Update triage agent prompt to classify complexity
3. Add `COMPLEXITY_ROUTING` config to pipeline orchestrator
4. Update `on_status_change()` to check complexity for routing
5. Frontend: show complexity badge, filter by complexity

### Phase 3: Review Phase + Reopen Flow (3-4 days)

1. Add `developed` and `reopen` statuses
2. Add `review` and `fix` agent phases
3. Update pipeline orchestrator with new skill mappings
4. Add reopen cycle protection (max 5 cycles)
5. Review agent prompt: fresh context, standards check, verdict
6. Frontend: review verdict UI, reopen indicator

### Phase 4: Deploy Pipeline (5-7 days)
**Why last:** Biggest scope, requires infra integration.

1. Add `deploying`, `testing`, `staging`, `released`, `closed`, `on_hold` statuses
2. Add deploy config to `projects.pipeline_config`
3. Implement Coolify deploy tool (REST API integration)
4. Add `deploy`, `qa_test`, `release` agent phases
5. Deploy failure handling: CI fail → reopen, server fail → on_hold
6. Auto-transitions: deploying → testing on success
7. Frontend: deploy status tracking, staging approval UI
8. Branching model: keep feature branch alive through pipeline

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Status explosion (11 → 18+) | UI complexity, user confusion | Phase-based progressive disclosure; simple items skip most statuses |
| Coolify API instability | Deploy tracking breaks | Polling + timeout fallback; `on_hold` as safe state |
| Complexity misclassification | Wrong routing | Allow manual override; reopen cycle catches mistakes |
| WS upgrade breaks streaming | Agent UI broken during migration | Feature flag; keep broadcast as fallback |
| Migration breaks existing data | Data loss | Backward-compatible: new statuses additive, old statuses still valid |

## Success Metrics

- [ ] All WS events reach correct subscribers (0 stale event bugs)
- [ ] Session stream latency < 100ms (session-targeted vs broadcast)
- [ ] Simple items complete pipeline 40% faster (skip gates)
- [ ] Deploy failures auto-detected within 60s
- [ ] Complex items get independent review before deploy
- [ ] Full automated loop: new → closed without human intervention (Simple items)

## Unresolved Questions

1. **Coolify credentials** — per-project or global? Jarvis uses per-project `coolifyResources`. BB should match?
2. **QA testing** — Jarvis uses browser automation (Playwright) against staging URL. BB has Playwright e2e but not wired to pipeline. Wire it or keep manual?
3. **Antigravity equivalent** — Jarvis has server-side execution runner. BB only has CLI/desktop. Need cloud runner?
4. **Shadow evaluator** — Jarvis has Pikachu shadow eval. Worth building for BB?
5. **Related issue batching** — Jarvis batches related issues in one agent session. BB batch commands run independently. Worth the complexity?
