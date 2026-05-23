# Jarvis vs Bumblebee — Automation Gap Analysis

**Date:** 2026-04-05
**Status:** Bumblebee 70% ready for full automation; 5-6 critical gaps vs Jarvis.

---

## Gaps Found (Ranked by Severity)

### CRITICAL — Blocks end-to-end automation

#### 1. Deploy/Release Auto-Trigger Missing
**Jarvis:** `pipeline-orchestrator.ts` maps `released` status → `forge-release` skill. Agent auto-merges + deploys.
**BB:** Status mapping ends at `released`; no auto-merge or coolify invocation. Merge coordinator endpoints exist but no background worker processes the queue.
**Impact:** Items sit at `released`. Deploy is manual. Pipeline incomplete.
**Fix:** Wire `pipeline_orchestrator.py` to trigger `deploy` skill on `released` status. Skill: merge (via coordinator) → coolify deploy → auto-advance to `closed`.
**Estimate:** M | **Files:** `pipeline_orchestrator.py`, `coolify_service.py`, `merge_coordinator_service.py`

#### 2. Background Worker for Merge Coordinator Missing
**Jarvis:** Unified queue dispatcher (`dispatchNextForProject()`) processes both agent + merge sessions.
**BB:** Merge queue model + REST endpoints exist. No background job reads pending merges, executes git operations, writes results back.
**Impact:** Merges never run. CI/CD pipeline broken.
**Fix:** Add async worker to API startup: poll merge_queue → git fetch/merge → write state=completed → trigger next phase.
**Estimate:** M | **Files:** `merge_coordinator_service.py`, `main.py`

#### 3. Session Status Auto-Sync Race Condition
**Jarvis:** Per-issue lock serializes concurrent status changes. No duplicate sessions.
**BB:** 2-min dedup window + no mutex. Two concurrent status changes can both pass dedup check.
**Impact:** Rare duplicate sessions; double-merges or repeated test runs.
**Fix:** Add asyncio.Lock per-issue in `on_status_change()` entry point.
**Estimate:** S | **Files:** `pipeline_orchestrator.py`

---

### SHOULD — Reduces reliability

#### 4. Rate Limit Throttling Not Wired
**Jarvis:** Checks `hasAnyQuota()` before dispatch. Pauses if exhausted.
**BB:** `rate_limit_tracker.py` + `work_item_cost_service.py` built but never invoked. Sessions dispatch regardless of budget.
**Impact:** Rate limit hits → dead-lettered sessions. Transient failures treated permanent.
**Fix:** Call `work_item_cost_service.can_continue()` in `dispatch_service.py` before enqueueing.
**Estimate:** S | **Files:** `dispatch_service.py`

#### 5. Session Context Not Loaded on Resume
**Jarvis:** `resumeDesktopSession()` loads previous messages + persists context if threshold exceeded.
**BB:** `session_context` field exists + `session_checkpoint_service.py` built. CLI doesn't load context at phase start.
**Impact:** Multi-phase items lose continuity. Triage→Analyze→Implement wastes tokens re-analyzing.
**Fix:** CLI: load `session_context` on startup, inject into system prompt. On completion: extract + save key decisions/files.
**Estimate:** M | **Files:** `cli-ts/src/commands/agent.ts`, `agent_session_service.py`

#### 6. No Per-Step Model Override
**Jarvis:** Step config specifies `model` to route complex steps to expensive models.
**BB:** Phase routing only specifies `provider`. No model selection per step.
**Impact:** Wastes quota on simple steps; can't escalate complex analysis.
**Fix:** Add `model` field to `phase_routing` JSONB schema + dispatch logic.
**Estimate:** S | **Files:** `dispatch_service.py`, schema migrations

---

### NICE — Polish

#### 7. No Global Pipeline Pause
**Jarvis:** `isPipelinePaused()` circuit breaker. Queue grows but dispatch stops.
**BB:** Can't pause without killing daemons.
**Fix:** Add `paused_at` timestamp to projects table. Check in `on_status_change()`.
**Estimate:** S | **Files:** `pipeline_orchestrator.py`

---

## What BB Does Better

1. **Multi-Device Execution Locks:** Prevents concurrent work on same item across devices (Jarvis looser).
2. **Branch Allocator Determinism:** Hash-based branch names reduce merge conflicts (Jarvis device-local).
3. **Hybrid Executor Abstraction:** Clean LOCAL|REMOTE pattern (Jarvis hardcoded).
4. **Per-Item Cost Tracking:** Granular budget per work item vs per-session.

---

## Automation Loop Readiness

```
new → triage ✅ → analyze ✅ → planned ✅
  → approve ⚠️ (complexity logic works, untested)
  → approved ✅
  → implement ⚠️ (depends on phase config)
  → in_review ✅
  → test ⚠️ (skill works, blocked on merge)
  → deploying ❌ (no skill mapped)
  → testing ⚠️
  → staging ⚠️ (auto-skip works, but prior deploy missing)
  → released ❌ (no auto-merge or deploy)
  → closed ❌ (unreachable)
  
Failure loops:
  → failed → reimplement ✅ (max 3x)
  → reopen → fix ✅ (max 5x)
```

**Verdict:** Phases 1–5 (triage through test) ~90% ready. Phases 6–8 (deploy/release/close) **0% ready**.

---

## Unresolved Qs

1. Is merge coordinator git runner implemented yet? All-sprints lists as pending.
2. Are checkpoints written during CLI execution?
3. Is `phase_routing` actively used or legacy?
4. Does device_offline_checker background job exist in Python (vs Tauri only)?
5. Is coolify integration production-tested?

---

## Recommended Sequence

1. **Week 1:** Background merge worker + deploy skill wiring (critical path, 4 days)
2. **Week 1:** Dedup mutex + rate limit gate + model override (quick wins, 3 days)
3. **Week 2:** Session context persistence (polish, 2 days)

**Total:** ~9 days to feature parity with Jarvis.
