# Phase 2 — Safety + Observability

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 2
- Failure mode taxonomy: [`../reports/researcher-260517-2010-agent-architecture-standards.md`](../reports/researcher-260517-2010-agent-architecture-standards.md) §8
- ECC eval pattern: [`../reports/evaluation-260518-1725-everything-claude-code-applicability.md`](../reports/evaluation-260518-1725-everything-claude-code-applicability.md) §3.4
- Previous: [`./phase-01-single-agent-e2e.md`](./phase-01-single-agent-e2e.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🟡 High — required before exposing to non-internal users |
| Status | 🚧 Partial (~50%); BudgetEnforcer/LoopDetector/FailureClassifier scaffolded; OTel + EvalHarness pending |
| Duration | 1.5 weeks |
| Acceptance | Cannot deploy workflow change without passing 20-item golden set; budget cap halts runaway within 1% accuracy; full OTel trace per workflow run |

**Brief:** Wire Safety Plane (BudgetEnforcer + LoopDetector + FailureClassifier already coded — needs integration into harness flow). Build EvalHarness with **agent-eval YAML schema from ECC** as deploy gate. Add OTel trace emitter. Implement KillSwitch endpoint.

---

## Key Insights

### Already scaffolded (~50%)
- `services/safety/budget_enforcer.py` — 3-scope check functions exist; need wiring into harness pre-LLM-call
- `services/safety/loop_detector.py` — pattern matching exists; need triggering after each tool_call event
- `services/safety/failure_classifier.py` — rule-based classifier + mitigation dict; mitigation actuator pending Phase 5
- `services/obs/cost_tracker.py` — aggregation functions exist; need wiring into session updates

### From ECC research
- **agent-eval YAML schema** = direct adoption for our golden dataset format
- **Three-layer evals**: model-level (instruction following) + agent-level (task completion) + system-level (end-to-end)
- **pass@k metrics**: run N times, count passes — accounts for stochasticity

### Industry defaults (§12)
- Session: 60min wall, 160K tokens, $3
- Issue: $10 ceiling
- Project daily: $200
- Compaction trigger: 80%
- Retry max: 3
- Heartbeat: 30s
- Lease TTL: 10min

---

## Requirements

### Functional
- F1. BudgetEnforcer fires hard halt when any cap hit (session/issue/project)
- F2. LoopDetector fires when same tool+args repeated 3 times in last 5 calls
- F3. FailureClassifier categorizes every `session_failed` event with FailureReason enum
- F4. Mitigation strategy logged per failure (actuator deferred to Phase 5)
- F5. OTel trace per WorkflowRun: span per node, sub-spans per LLM/tool call
- F6. CostTracker aggregates real-time per session/issue/project; broadcasts via WebSocket (Phase 4)
- F7. EvalHarness: YAML task definitions + pytest/grep/regex judges + pass@k runner
- F8. Golden dataset: 20 representative issues across types (bug, feature, refactor) + 3 workflows
- F9. CI gate: `bumblebee eval run --golden` exit code → block PR merge if regression
- F10. KillSwitch endpoint `POST /api/sessions/{id}/kill` halts session in <5s

### Non-functional
- N1. OTel span overhead <5ms per LLM call
- N2. Eval suite full run <15 minutes (20 issues × 1 attempt)
- N3. Cost tracker accuracy ±1% vs LLM provider billing
- N4. Budget check overhead <10ms per LLM call

---

## Architecture

### Safety Plane Wiring

```
Harness pre-LLM-call:
  1. BudgetEnforcer.check_session_budget(session) ← raises BudgetExceeded
  2. BudgetEnforcer.check_issue_budget(issue_id)
  3. BudgetEnforcer.check_project_budget(project_id)
  
After tool_call event:
  1. LoopDetector.detect_loop(session_id) ← if True: fail session with INFINITE_LOOP
  
On session fail:
  1. FailureClassifier.classify_failure(error_text) ← enum
  2. session.failure_reason = enum
  3. Event(session_failed, payload={reason: enum, mitigation: dict})
  4. (Phase 5: MitigationActuator picks up)
```

### Eval Harness Schema (ECC agent-eval adopted)

```yaml
# bumblebee/eval/golden/fix-auth-bug.yaml
name: fix-auth-bug
description: Fix bcrypt cost factor (BB-2 style)
repo: ./fixtures/repos/sample-app
files:
  - api/auth.py
workflow: simple-fix-flow
issue:
  title: Fix bcrypt cost factor too low
  description: Currently cost=4; production should be 12+
  type: bug
  scope_hints: ["api/auth/**"]
prompt_overrides: {}  # optional per-role override
judge:
  - type: pytest
    command: pytest tests/test_auth.py -v
    must_pass: true
  - type: grep
    pattern: "rounds=1[2-9]"
    files: api/auth.py
    must_match: true
  - type: regex_negative
    pattern: "rounds=[1-4](?!\\d)"
    files: api/auth.py
budget:
  max_dollars: 5.0
  max_wall_min: 30
expected_pass_rate: 0.8  # pass@3 ≥ 80%
```

### Eval Runner

```python
# bumblebee/eval/runner.py
async def run_eval(yaml_path: Path, repeats: int = 3) -> EvalResult:
    spec = yaml.safe_load(yaml_path.read_text())
    passes = 0
    results = []
    for i in range(repeats):
        # 1. Clone fixture repo to fresh worktree (commit-pinned)
        # 2. Create issue per spec
        # 3. Trigger workflow
        # 4. Wait for completion (or timeout)
        # 5. Run judges
        result = await execute_single_run(spec)
        results.append(result)
        if result.passed: passes += 1
    return EvalResult(
        name=spec["name"],
        pass_rate=passes / repeats,
        expected=spec.get("expected_pass_rate", 0.8),
        details=results,
    )
```

### CI Gate

```yaml
# .github/workflows/eval-gate.yml
- name: Run eval golden set
  run: bumblebee eval run --golden --threshold=0.8
  # exit 1 if any task pass_rate < expected_pass_rate
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/services/execution/harness.py` | Insert BudgetEnforcer checks before LLM call + LoopDetector after tool call |
| `bumblebee/services/tool/executor.py` | Emit OTel span per tool execution |
| `bumblebee/main.py` | Register OTel instrumentation + lifespan hooks |
| `bumblebee/services/safety/failure_classifier.py` | Wire mitigation logging (actuator Phase 5) |
| `bumblebee/cli.py` | Add `bumblebee eval` subcommand group |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/obs/trace_emitter.py` | OTel SDK wrapper; span helpers |
| `bumblebee/services/safety/kill_switch.py` | Signal handler + session abort |
| `bumblebee/routers/sessions.py` | `POST /api/sessions/{id}/kill` endpoint |
| `bumblebee/eval/__init__.py` | Eval module |
| `bumblebee/eval/spec.py` | YAML task spec Pydantic model |
| `bumblebee/eval/runner.py` | Multi-run executor with pass@k |
| `bumblebee/eval/judges.py` | pytest, grep, regex_negative, exit_code judges |
| `bumblebee/eval/cli.py` | `bumblebee eval run/list/show` subcommands |
| `bumblebee/eval/golden/*.yaml` | 20 golden tasks (initial 5; expand) |
| `bumblebee/eval/fixtures/repos/sample-app/` | Mini repo for eval tasks |
| `.github/workflows/eval-gate.yml` | CI eval gate |
| `tests/test_safety_integration.py` | End-to-end safety flow tests |
| `tests/test_eval_runner.py` | Eval runner unit tests |
| `tests/test_kill_switch.py` | Kill switch tests |
| `docs/safety.md` | Safety plane reference |
| `docs/eval.md` | Eval harness usage guide |

### Delete

- (none)

---

## Implementation Steps

### Week 1 — Safety wiring + OTel

1. **Day 1: Safety wiring in harness**
   - Inject BudgetEnforcer + LoopDetector calls into `harness.run_role()`
   - Test: simulate runaway → BudgetExceeded raised → session marked FAILED

2. **Day 2: OTel trace emitter**
   - `bumblebee/services/obs/trace_emitter.py`
   - Wrap LLM calls and tool calls with spans
   - Add `OTEL_EXPORTER_OTLP_ENDPOINT` config support
   - Test with local Jaeger via docker-compose extra service

3. **Day 3: KillSwitch**
   - `bumblebee/services/safety/kill_switch.py`: signal token in session row + worker process polls
   - Endpoint `POST /api/sessions/{id}/kill` sets flag
   - Harness checks kill flag every N events; on detect: graceful shutdown + Event(kill_acknowledged)

4. **Day 4: CostTracker WebSocket prep**
   - Aggregator emits `cost_update` event every $0.10 increment
   - WebSocket route prepped (full UI Phase 4)

5. **Day 5: Safety integration tests**
   - `tests/test_safety_integration.py`
   - Test cases: budget breach, loop, kill switch, classifier on real error patterns

### Week 2 — Eval harness

6. **Day 6: Eval spec + runner skeleton**
   - `bumblebee/eval/spec.py`: Pydantic model for YAML schema
   - `bumblebee/eval/runner.py`: load YAML → execute workflow → run judges

7. **Day 7: Judges**
   - pytest judge: subprocess pytest + parse exit code
   - grep judge: file pattern check
   - regex_negative: pattern must NOT match
   - exit_code judge: arbitrary command
   - Test: each judge type with synthetic fixtures

8. **Day 8: Sample fixture repo**
   - `bumblebee/eval/fixtures/repos/sample-app/`: minimal FastAPI repo with auth bug
   - 5 initial golden tasks: fix-auth-bug, add-health-endpoint, refactor-config, doc-update, test-flaky-retry

9. **Day 9: Eval CLI + CI gate**
   - `bumblebee eval run --golden` runs all yamls
   - Output: pass rate per task, overall score, exit code if any < threshold
   - `.github/workflows/eval-gate.yml`: trigger on PR; require pass

10. **Day 10: Acceptance + docs**
    - Run full eval suite; verify pass rate >0.8 (target)
    - Write `docs/safety.md` + `docs/eval.md`
    - Commit: `feat(phase-2): safety wiring + OTel + eval gate + 5 golden tasks`

11. **Day 11: Buffer** — expand golden set toward 20 if time allows; otherwise log for Phase 6

---

## Todo List

- [ ] BudgetEnforcer integrated into harness
- [ ] LoopDetector integrated post tool_call
- [ ] FailureClassifier wired on session fail
- [ ] OTel trace emitter
- [ ] OTel local Jaeger via compose
- [ ] KillSwitch endpoint + signal flow
- [ ] CostTracker WS-prepped emit
- [ ] tests/test_safety_integration.py
- [ ] Eval YAML spec model
- [ ] Eval runner with pass@k
- [ ] 4 judge types (pytest, grep, regex_negative, exit_code)
- [ ] Sample fixture repo
- [ ] 5 golden tasks (expand to 20 by Phase 6)
- [ ] `bumblebee eval run` CLI
- [ ] CI eval gate workflow
- [ ] tests/test_eval_runner.py
- [ ] docs/safety.md + docs/eval.md
- [ ] Acceptance: eval gate works as merge guard

---

## Success Criteria

| Criterion | Verification |
|---|---|
| Budget cap halts session within 1% accuracy | tests/test_safety_integration::test_budget_halt |
| Loop detector breaks within 5 repeated calls | tests/test_loop_detector::test_loop_catches_repeat |
| FailureClassifier tags ≥70% of failures correctly | manual label set of 30 past errors |
| OTel trace export to Jaeger | docker-compose up jaeger; verify spans in UI |
| 5 golden eval tasks pass at >80% rate | `bumblebee eval run --golden` |
| CI gate blocks PR with broken prompt | seed a regression PR; verify red status |
| KillSwitch halts in <5s p95 | tests/test_kill_switch::test_halt_timing |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| OTel span overhead too high | M | M | Sampling at 10%; full trace on error only |
| Eval suite stochastic (flaky) | H | M | pass@3 minimum; expected_pass_rate config per task |
| Sample fixture repo drifts from real complexity | M | M | Add real anonymized cases over time; defer realistic suite to Phase 6 |
| BudgetEnforcer race condition (2 sessions same issue update concurrently) | M | M | SELECT FOR UPDATE on aggregation query; or eventually consistent + tolerance |
| KillSwitch polling latency >5s | L | M | Reduce poll interval to 2s; or use PG NOTIFY for instant signal |
| CI eval gate slow (15min+) | M | L | Parallel runs per task; cache fixture clones |

---

## Security Considerations

- **OTel exporter URL**: don't hardcode; load from env; require TLS for non-localhost
- **Fixture repos**: pin to specific commits; don't fetch untrusted repos at eval time
- **KillSwitch authn**: require valid session ID + (Phase 0+) auth token
- **CostTracker rate limits**: prevent attacker spamming sessions to inflate project bill; per-user session creation rate limit Phase 4
- **Eval prompts**: treat as untrusted external content; sanitize before injecting into context

---

## Next Steps

**Unblocks:**
- Phase 3 (ScopeLease) — needs OTel for multi-session debugging
- Phase 5 (Failure taxonomy actuator) — needs Classifier wired
- Phase 7 (Replay UI) — needs OTel trace data
- Production deploy — eval gate must exist before launch

**Depends on:**
- Phase 1 (real harness) — for real cost/event data

---

## Unresolved Questions

1. **OTel backend choice**: Jaeger (open-source, self-host) vs Honeycomb/Datadog (managed, $). Phase 2: Jaeger via compose. Re-eval at production.
2. **Eval task source**: only synthetic, or also mine from v2 production failures? Plan §11 says skip v2 calibration; revisit at Phase 6.
3. **pass@k count default**: k=3 vs k=5? 5 more reliable but 67% more cost. Start k=3.
4. **LLM-judge for soft criteria**: e.g., "code quality" — Phase 5 work.
5. **Cost alerts**: Slack/email when project daily approaching cap? Defer to Phase 7 notifications.
