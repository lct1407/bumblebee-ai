# Phase 6 — Test + Polish

**Track:** Final (blocking) | **Effort:** 1 week | **Status:** pending | **Depends:** P3, P4, P5

## Context

The "no báo xong nhưng đầy lỗi" gate. Comprehensive test suite + 4 templates verified end-to-end + GitHub PR webhook + docs rewrite + final polish.

## Requirements

- All 4 workflow templates pass end-to-end with **real Claude API** (not mock)
- 12 regression cases (4 templates × 3 modes) green in CI
- E2E Playwright suite covers golden paths
- GitHub PR webhook syncs `pr_status` automatically
- Migration script `import-legacy.py` (best-effort: legacy JSON → v2 schema)
- Docs rewrite: `docs/getting-started.md`, `docs/workflows.md`, `docs/architecture.md`
- Performance baseline: 50 concurrent items, p95 dequeue < 500ms
- Coverage thresholds enforced in CI

## File Ownership

```
api/tests/                     — pytest test suite expansion
  unit/
  integration/
  load/
web/tests/
  unit/                        — vitest
  e2e/                         — playwright
cli-ts/tests/                  — vitest
scripts/
  run-regression.py            — 12 cases CI runner
  import-legacy.py             — v0.13 archive → v2 schema
  perf-baseline.py             — concurrent load test
.github/workflows/
  test.yml                     — CI pipeline
docs/
  getting-started.md           — rewrite
  workflows.md                 — NEW (workflow concepts + 4 templates)
  architecture.md              — rewrite
  api-reference.md             — regenerate from OpenAPI
api/src/api/webhooks.py        — GitHub PR webhook handler
```

## Implementation Steps

### Stage A — GitHub PR webhook (1 day)
1. `api/src/api/webhooks.py`:
   - `POST /webhooks/github` — verify HMAC signature
   - Handle `pull_request` events (opened/closed/merged/synchronize)
   - Match by `branch_name` → update `work_items.pr_status` + `pr_url`
   - Auto-transition: PR merged → item.status=done
   - Log event in `work_item_events`
2. Web UI: setup wizard `/projects/[slug]/settings/integrations` — generate webhook URL + secret
3. Test: replay sample GitHub payloads → assert state changes

### Stage B — Migration script (0.5 day)
4. `scripts/import-legacy.py`:
   - Load `archive/legacy-{date}.json`
   - Map old work_items (15 statuses) → new 7 statuses (table provided)
   - Drop pipeline_config (warn user)
   - Preserve comments, events, parent_id chain
   - Output: skipped-items report
5. Smoke: import sample legacy archive → verify counts

### Stage C — E2E test suites (2 days)
6. **Backend pytest (api/tests/integration/):**
   - Run each of 4 templates with mocked Claude responses
   - Assert workflow_run final state, agent_sessions count, work_item.status=done
   - A2A flow: lead delegates, child completes, lead resumes
   - Crash recovery: kill executor, restart, verify continuation
7. **Web Playwright (web/tests/e2e/):**
   - Login → create project → create item → run simple template → verify done badge
   - Open workflow editor → drag 5 nodes → connect → save → reload → verify persisted
   - Run complex template → human gate → click approve → flow continues
   - Real-time: open 2 browser tabs, mutate in tab 1, see update tab 2 via WS
   - CLI parity smoke: `bb item create` from terminal → web shows item via WS
8. **CLI vitest (cli-ts/tests/):**
   - Mock API server (msw)
   - Each command: input → expected output
   - Daemon: process 1 queue item end-to-end

### Stage D — Regression suite (1 day)
9. `scripts/run-regression.py`:
   - 12 cases: { simple-task, complex-feature, bug-fix, spike-research } × { auto, explicit, manual }
   - Each case: create item, trigger workflow, await done, assert golden output (token range, files modified, comment posted)
   - JSON report with pass/fail + diff
10. CI integration: nightly cron + on tag push

### Stage E — Performance baseline (0.5 day)
11. `scripts/perf-baseline.py`:
   - Spawn 50 concurrent workflow_runs (simple-task, mocked Claude)
   - Measure: dequeue p50/p95/p99, full run duration, DB connection pool saturation
   - Pass criteria: p95 dequeue < 500ms, no deadlock, no leaked connections
12. Document baseline numbers in `docs/architecture.md`

### Stage F — Docs rewrite (1.5 days)
13. `docs/getting-started.md`:
    - Install (api + web + cli + tauri)
    - First project + first workflow run (5 min tutorial)
14. `docs/workflows.md` (NEW):
    - Workflow concept (data, not code)
    - 8 node types reference
    - 4 template walkthroughs
    - YAML schema reference
    - Authoring tips
15. `docs/architecture.md`:
    - System diagram (port from brainstorm doc)
    - Data flow
    - Engine internals
    - A2A pattern
16. `docs/api-reference.md` regenerate from OpenAPI (`scripts/gen-api-docs.py`)
17. Update root `CLAUDE.md` for v2 conventions

### Stage G — Real Claude smoke (0.5 day)
18. **CRITICAL:** Manual smoke with real Claude API (not mocked):
    - Create real test project + item
    - Run each of 4 templates
    - Verify: branch created, code committed, PR opened, comments posted, tokens reasonable
    - Document edge cases found in `docs/known-issues.md`

### Stage H — CI + thresholds (0.5 day)
19. `.github/workflows/test.yml`:
    ```yaml
    backend-test:    pytest --cov --cov-fail-under=70
    frontend-test:   vitest --coverage --threshold=60 + playwright
    cli-test:        vitest --coverage --threshold=70
    regression:      python scripts/run-regression.py
    type-check:      mypy api/ + tsc web/ cli-ts/
    perf-smoke:      python scripts/perf-baseline.py
    ```
20. Block merge if any job fails

## Todo

### Stage A — Webhook
- [ ] `api/webhooks.py` GitHub handler
- [ ] HMAC signature verify
- [ ] PR event → state transitions
- [ ] Web UI integration setup wizard

### Stage B — Migration
- [ ] `scripts/import-legacy.py`
- [ ] Status mapping table verified
- [ ] Smoke import sample archive

### Stage C — E2E
- [ ] 4 templates pytest integration (mocked)
- [ ] A2A flow integration
- [ ] Crash recovery integration
- [ ] 5 Playwright scenarios
- [ ] CLI vitest with msw

### Stage D — Regression
- [ ] `scripts/run-regression.py` 12 cases
- [ ] Golden output assertions
- [ ] CI nightly + tag push

### Stage E — Perf
- [ ] `scripts/perf-baseline.py`
- [ ] Document baseline numbers

### Stage F — Docs
- [ ] `getting-started.md` rewrite
- [ ] `workflows.md` NEW
- [ ] `architecture.md` rewrite
- [ ] `api-reference.md` regen
- [ ] `CLAUDE.md` v2 update

### Stage G — Real smoke
- [ ] 4 templates real Claude run
- [ ] `docs/known-issues.md` populated

### Stage H — CI
- [ ] Test workflow yml
- [ ] Coverage thresholds enforced
- [ ] Regression in CI
- [ ] Perf smoke in CI

## Definition of Done (FINAL)

This is the gate to declare Bumblebee 2.0 production-ready:

- [ ] **All 4 workflow templates pass end-to-end với REAL Claude API** (Stage G manual smoke)
- [ ] **12 regression cases green in CI** (Stage D)
- [ ] **Web E2E:** login → create → board → run → done — zero bugs (Stage C)
- [ ] **CLI parity:** every web action has CLI command (parity matrix doc verified)
- [ ] **Migration:** `scripts/import-legacy.py` maps v0.13 archive → v2 schema OK (or explicit drop notice)
- [ ] **Docs:** `workflows.md` + `getting-started.md` + `architecture.md` rewritten
- [ ] **Performance:** 50 concurrent items, p95 dequeue < 500ms
- [ ] **Coverage:** backend ≥ 70%, frontend ≥ 60%, cli ≥ 70%
- [ ] **Zero TODO/FIXME/HACK** markers in new code (`grep -r 'TODO\|FIXME\|HACK' api/src cli-ts/src web/src` → empty)
- [ ] **CI green:** all jobs pass on main branch
- [ ] **GitHub webhook:** PR event auto-syncs pr_status (verified with real PR)
- [ ] **Type check:** mypy + tsc clean across all packages
- [ ] **Tag v2.0.0** pushed to GitHub
- [ ] **Release notes** in `CHANGELOG.md`

## Success Criteria

Same as DoD above. No deviation.

## Risks

- Real Claude smoke reveals integration bug late: mitigation — partial real runs at end of P3 (1 template)
- Regression suite flakiness: rerun 3× before failing CI; deterministic mocked Claude responses
- GitHub webhook signature drift: pin handler to spec version; integration test with sample payloads
- Coverage threshold pushes shallow tests: code-reviewer agent reviews test quality, not just coverage %
