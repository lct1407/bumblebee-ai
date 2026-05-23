# Phase 5 — Failure Taxonomy + Mitigation Actuator

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 5 + Plane 5 Safety
- Failure modes research: [`../reports/researcher-260517-2010-agent-architecture-standards.md`](../reports/researcher-260517-2010-agent-architecture-standards.md) §8
- ECC recovery patterns: [`../reports/evaluation-260518-1725-everything-claude-code-applicability.md`](../reports/evaluation-260518-1725-everything-claude-code-applicability.md) §5
- Previous: [`./phase-04-web-mvp-coordinator.md`](./phase-04-web-mvp-coordinator.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🟡 High — reduces wasted retries on different failure modes |
| Status | 🚧 Partial (~60%) — classifier rule-based exists; actuator pending; LLM-as-judge layer optional |
| Duration | 1 week |
| Acceptance | 70%+ of past failures classified correctly on labeled set; mitigation actuator routes per-cause; web shows failure analysis |

**Brief:** Upgrade FailureClassifier with optional LLM-as-judge layer. Build MitigationActuator that executes recovery strategy (split/compact/retry/escalate). Add web failure analysis UI.

---

## Key Insights

- Rule-based classifier already exists; covers 60-70% of known patterns
- LLM-as-judge: use cheap fast model (Haiku) to classify error text into taxonomy; 5-10% of cases where rules don't match
- Mitigation actuator must be **idempotent** + **bounded** (max 1 retry per session by default; configurable)
- Each mitigation strategy maps to specific action:
  - `context_exhaust` → split into 2 subagents (Coordinator re-plan with smaller scope)
  - `hallucination` → fact-check + retry with explicit constraints
  - `tool_error` → retry with hint
  - `infra` → exponential backoff + retry
  - `goal_drift` → re-anchor goal + retry
  - `planning_brittleness` → re-plan from current state
  - `infinite_loop` → escalate human (no auto retry)
  - `budget_exceeded` → escalate human

---

## Requirements

### Functional
- F1. LLM-judge fallback layer when rule-based classifier returns UNKNOWN
- F2. MitigationActuator: execute recommended strategy per FailureReason
- F3. Each strategy implementation: idempotent, bounded retry count, audit event
- F4. Web `/projects/[slug]/issues/[n]` failure tab: shows reason + mitigation history
- F5. Per-cause retry counter on session; max_cycles configurable per workflow
- F6. Escalation events trigger Notification (Phase 7 hook ready)
- F7. Auto-route to Coordinator on `context_exhaust` and `planning_brittleness`

### Non-functional
- N1. LLM-judge call <5s p95 (cheap model)
- N2. Mitigation actuator latency <1s after session_failed event
- N3. False-positive escalation rate <5%

---

## Architecture

### Mitigation Actuator Flow

```
Event(session_failed, payload={failure_reason})
  ↓
FailureClassifier.recommend_mitigation(reason) → {action, params}
  ↓
MitigationActuator.execute(strategy, session, attempts_so_far)
  ├── if attempts > max_cycles → escalate (Notification + human)
  ├── action="retry_with_hint":
  │     - Re-create session with prior_session_id + hint
  │     - Enqueue same task
  ├── action="split_into_subagents":
  │     - Re-trigger Coordinator on parent issue
  │     - Coordinator decomposes more finely
  ├── action="compact_and_retry":
  │     - Force compaction on resume
  │     - Create continuation session with checkpoint
  ├── action="backoff_retry":
  │     - Sleep(backoff_seconds)
  │     - Re-enqueue
  ├── action="escalate_human":
  │     - Status → needs_info
  │     - Notification(type=review_requested)
  └── action="reanchor_and_retry":
        - Inject "PRIMARY GOAL:" prefix in next prompt
        - Retry
```

### LLM-as-judge

```python
# bumblebee/services/safety/failure_classifier.py (v2)
async def classify_with_llm(error_text: str, recent_events: list[Event]) -> FailureReason:
    """Fallback when rule-based returns UNKNOWN."""
    prompt = f"""Classify this agent failure into ONE category:
    - hallucination
    - tool_error
    - context_exhaust
    - goal_drift
    - infra
    - planning_brittleness
    - timeout
    - budget_exceeded
    - infinite_loop
    - unknown
    
    Error: {error_text}
    Recent events: {[e.type for e in recent_events]}
    
    Respond with ONLY the category name."""
    
    response = await llm_provider.invoke_simple(prompt, model="claude-haiku")
    return FailureReason(response.strip().lower())
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/services/safety/failure_classifier.py` | Add classify_with_llm fallback; track reason in DB |
| `bumblebee/services/execution/harness.py` | On session fail: classify → actuator dispatch |
| `bumblebee/models/agent_session.py` | Verify failure_reason + failure_detail used |
| `bumblebee/seeds/seed_default.py` | Add mitigation policy config to seeded project |
| `web/src/app/(protected)/projects/[slug]/issues/[number]/page.tsx` | Add Failure tab |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/safety/mitigation_actuator.py` | Strategy executor |
| `bumblebee/services/safety/strategies/__init__.py` | Strategy modules |
| `bumblebee/services/safety/strategies/retry_with_hint.py` | RetryWithHint impl |
| `bumblebee/services/safety/strategies/compact_retry.py` | CompactAndRetry impl |
| `bumblebee/services/safety/strategies/split_subagents.py` | Split via Coordinator re-trigger |
| `bumblebee/services/safety/strategies/backoff_retry.py` | Exp backoff |
| `bumblebee/services/safety/strategies/escalate_human.py` | Notification + status change |
| `bumblebee/services/safety/strategies/reanchor.py` | Goal re-anchor injection |
| `tests/test_mitigation_actuator.py` | Per-strategy tests |
| `web/src/components/failure-analysis.tsx` | Failure detail UI |
| `tests/fixtures/failure_samples.json` | 30 labeled error texts for classifier accuracy eval |
| `docs/failure-taxonomy.md` | Reference doc |

### Delete

- (none)

---

## Implementation Steps

1. **Day 1: LLM-as-judge**
   - Add `classify_with_llm` to FailureClassifier
   - Hook into rule-based: if UNKNOWN → LLM
   - Test with synthetic error texts

2. **Day 2: Actuator skeleton + retry_with_hint**
   - `mitigation_actuator.py`: dispatch by action name
   - First strategy: retry_with_hint
   - Test: tool error → actuator creates continuation session

3. **Day 3: compact_and_retry + reanchor**
   - compact: force Tier 2 compaction at next session start
   - reanchor: inject "PRIMARY GOAL: ..." in next prompt
   - Tests per strategy

4. **Day 4: split_into_subagents + backoff_retry + escalate_human**
   - split: re-trigger Coordinator with parent issue + finer decomposition hint
   - backoff: sleep(backoff_seconds) + re-enqueue
   - escalate: status=needs_info + Notification stub (Phase 7 wires full)
   - Tests per strategy

5. **Day 5: Web failure UI**
   - `failure-analysis.tsx`: render failure_reason + history + mitigation log
   - Add "Failure" tab to issue detail page
   - Integration: feed from event log + session row

6. **Day 6: Classifier accuracy eval**
   - Labeled set of 30 past errors (manual label)
   - Run rule-based + LLM-judge; compute accuracy
   - Target: rule >50%, combined >70%
   - Tune rules if below target

7. **Day 7: Acceptance + docs**
   - End-to-end: induce each failure type → verify mitigation routes correctly
   - `docs/failure-taxonomy.md` finalized
   - Commit: `feat(phase-5): mitigation actuator + LLM-judge classifier + web failure UI`

---

## Todo List

- [ ] LLM-as-judge classifier fallback
- [ ] MitigationActuator dispatcher
- [ ] retry_with_hint strategy
- [ ] compact_and_retry strategy
- [ ] reanchor_and_retry strategy
- [ ] split_into_subagents strategy
- [ ] backoff_retry strategy
- [ ] escalate_human strategy (Notification stub)
- [ ] Per-strategy tests
- [ ] failure-analysis.tsx web component
- [ ] Issue detail Failure tab
- [ ] 30-label classifier accuracy eval
- [ ] Tune rules to target >70% combined accuracy
- [ ] docs/failure-taxonomy.md
- [ ] Phase 5 commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| Classifier >70% accuracy on labeled set | eval script |
| Each strategy executes idempotently | tests/test_mitigation_actuator per strategy |
| max_cycles cap prevents infinite retry | test forces 5 fails, verify escalation |
| Web failure UI shows reason + history | manual demo |
| context_exhaust → split routes to Coordinator | test_scenario_split |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| LLM-judge cost spike | M | M | Use cheap model (Haiku); cap per-day judge calls |
| Misclassified failure → wrong mitigation worsens | M | H | Log all classifications; manual review weekly Phase 5-6 |
| Retry loops (mitigation triggers same fail) | H | M | max_cycles + per-session retry counter; circuit-break |
| Strategy idempotency violations | M | M | Each strategy uses idempotency_key on re-enqueue |
| Escalation Notification spam | M | L | Dedupe by (issue, reason) within 1 hour |

---

## Security Considerations

- **Classifier prompt injection**: error text may contain attacker-crafted payload; LLM-judge receives sanitized error text (truncate to 2000 chars; strip control chars)
- **Mitigation auto-execute**: bounded by max_cycles + budget caps already in place
- **Escalation Notification**: contains issue/session ID only; no raw error text leak

---

## Next Steps

**Unblocks:**
- Production reliability — must have before exposing to real users
- Phase 7 Notifications — escalate_human strategy emits notif

**Depends on:**
- Phase 2 (FailureClassifier wired) — for failure_reason data
- Phase 4 (Coordinator) — split_into_subagents needs Coordinator

---

## Unresolved Questions

1. **LLM-judge model choice**: Haiku ($1/M in) cheapest; Sonnet ($3/M) more accurate. Start Haiku; measure accuracy.
2. **Per-project mitigation policy**: should some strategies be disabled per project? Phase 5 baseline: all enabled; UI toggle Phase 7.
3. **Labeled failure set source**: synthetic (write 30 example errors) or mine from v2 logs? Synthetic faster; v2 mining if accuracy poor.
4. **Mitigation observability**: track mitigation_attempts as separate event type? Yes, `Event(type=mitigation_executed, payload={strategy, attempts})`.
5. **Goal re-anchor prompt format**: prefix every turn vs only first? Phase 5 day 3 decision: every M turns (M=10).
