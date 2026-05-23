# Bumblebee 2.0 — Test Execution Scenario

**Mục tiêu:** lấp đủ gap test theo phase-06 → đạt DoD (BE ≥70%, FE ≥60%, CLI ≥70%, 12 regression cases pass, 4 templates real-Claude smoke).

**Thực hiện theo thứ tự** Wave 1 → Wave 5. Mỗi wave có gate exit; KHÔNG chuyển wave nếu gate đỏ.

---

## Inventory hiện tại (snapshot 2026-04-27)

**Đã có:**
- `api/src/workflow/tests/` — `test_expression.py`, `test_simple_workflow.py`, `test_validator.py`
- `api/tests/v2/agents/` — `test_budget.py`, `test_runner.py`
- `api/tests/v2/api/` — `test_webhooks.py`, `test_workflow_runs.py`
- `api/tests/v2/workflow/` — `test_run_store_db.py`
- `web/e2e/` — `all-features.spec.ts`, `pipeline-settings.spec.ts` (legacy, cần audit)
- `web/playwright.config.ts` ✓
- pytest + pytest-asyncio + pytest-cov + pytest-mock trong `api/requirements.txt`
- vitest declared trong `cli-ts/package.json` (chưa có file test)

**Thiếu:**
- Unit tests riêng cho 7/8 node types (`agent_node`, `condition_node`, `delay_node`, `git_node`, `human_approval_node`, `parallel_node`, `trigger_node`, `update_node`)
- A2A integration test (`agents/a2a.py`)
- Crash recovery / state resume integration
- 4 templates × mocked Claude integration
- CLI vitest + msw setup
- New Playwright suite cho v2 (workflow editor, human gate, WS realtime)
- `scripts/run-regression.py` (12 cases)
- `scripts/perf-baseline.py`
- CI pipeline `.github/workflows/test.yml` cho v2

---

## Wave 1 — Backend Unit (foundation, ~2 ngày)

**Goal:** mọi node executor + agent helper có unit test riêng, cô lập, mock Claude.

### 1.1 Node executors (`api/src/workflow/tests/test_nodes_*.py`)

Mỗi file 1 node, ≥3 cases: happy / invalid_config / failure_path.

| File | Node | Test cases |
|---|---|---|
| `test_node_agent.py` | agent_node | spawn session OK · model invalid · agent_mock returns error · WS broadcast emit |
| `test_node_condition.py` | condition_node | true branch · false branch · invalid expression · missing field |
| `test_node_delay.py` | delay_node | sleep N giây · cancel mid-sleep · negative N reject |
| `test_node_git.py` | git_node | branch create · commit · open_pr (mock gh) · merge conflict |
| `test_node_human_approval.py` | human_approval_node | pause + resume on approve · timeout · auto_skip_if expression |
| `test_node_parallel.py` | parallel_node | all_pass · any_fail short-circuit · empty branches reject |
| `test_node_trigger.py` | trigger_node | manual · item_created · status_change match · schedule cron |
| `test_node_update.py` | update_node | update.status · update.field · invalid field reject |

**Target:** ≥24 tests, all pass, coverage `api/src/workflow/nodes/` ≥80%.

### 1.2 Agent layer (`api/tests/v2/agents/`)

Bổ sung:
- `test_a2a.py` — sync call (Lead→Researcher wait reply), async call (Lead→Coder fire-and-monitor), bidirectional Reviewer↔Writer qua `agent_messages`
- `test_roles.py` — role→prompt path mapping, model selection theo config
- `test_worktree.py` — create/cleanup, path collision, worktree dedicated per item
- `test_scanners.py` — codebase search outputs (mocked fs)

### 1.3 Workflow engine internals

Bổ sung trong `api/src/workflow/tests/`:
- `test_loops.py` — `max_loops` per edge enforce, global `max_node_executions=50` cap
- `test_loader.py` — load 4 templates (`simple-task`, `complex-feature`, `bug-fix`, `spike-research`) parse OK
- `test_executor.py` — node execution order, edge condition eval, error propagation

**Gate exit Wave 1:**
```
cd api && pytest tests/v2 src/workflow/tests --cov=src/workflow --cov=src/agents --cov-fail-under=75
```
Phải xanh + coverage báo cáo ≥75% cho 2 module này.

---

## Wave 2 — Backend Integration (~2 ngày)

**Goal:** workflow chạy E2E với mocked Claude, persistence + recovery hoạt động.

### 2.1 Templates × mocked Claude (`api/tests/v2/integration/test_templates.py`)

Dùng `api/src/workflow/agent_mock.py` để mock Claude responses deterministic.

```python
@pytest.mark.parametrize("template", ["simple-task", "complex-feature", "bug-fix", "spike-research"])
async def test_template_end_to_end(template, db_session, mock_claude):
    # 1. Load YAML
    # 2. Trigger workflow_run
    # 3. Drive executor đến terminal
    # 4. Assert: workflow_run.status=done, work_item.status=done,
    #            agent_sessions count đúng spec, comments posted
```

### 2.2 State persistence + crash recovery (`test_recovery.py`)

- Start run → kill executor mid-flight (raise SystemExit ở node thứ 2)
- Reload từ DB → resume từ `current_node_ids` → drive đến done
- Assert: không double-execute node đã xong; agent_sessions không duplicate

### 2.3 A2A flow (`test_a2a_flow.py`)

- Lead delegate Coder → Coder hoàn thành → Lead nhận announcement → tiếp tục
- Reviewer + Writer parallel với bidirectional `agent_messages`
- Assert: message ordering trong `agent_messages` đúng

### 2.4 Webhook GitHub (mở rộng `test_webhooks.py`)

- Replay sample payloads: `pull_request.opened`, `closed`, `merged`, `synchronize`
- HMAC verify: signature đúng → 200, sai → 401
- Match by `branch_name` → update `pr_status` + auto-transition `done` khi merged
- Assert event log trong `work_item_events`

### 2.5 Queue concurrency (`test_queue_concurrency.py`)

- Spawn 10 dequeue requests song song trên 5 queue items → đảm bảo SKIP LOCKED không double-dequeue
- Heartbeat refresh `locked_at`
- Stale lock reaper: device offline → re-enqueue

**Gate exit Wave 2:**
```
cd api && pytest tests/v2 --cov=src --cov-fail-under=70
```
Coverage backend tổng thể ≥70%.

---

## Wave 3 — Frontend (~2 ngày)

**Goal:** Playwright E2E 5 scenarios + component unit tests cơ bản.

### 3.1 Setup vitest cho web

Thêm vào `web/package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```
Cài: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `jsdom`.

### 3.2 Unit tests (`web/src/**/__tests__/`)

- `workflow-validator.test.ts` — pre-save checks (orphan node, missing edge, loop)
- `workflow-mocks.test.ts` — mock shape stable
- `node-properties-panel.test.tsx` — render form per node type, validate input
- `branch-pr-tab.test.tsx` — PR status badges đúng màu (draft/open/merged/closed)

### 3.3 Playwright E2E (`web/e2e/v2/`)

Audit + delete legacy `all-features.spec.ts` nếu đã obsolete. Tạo 5 scenarios mới:

| File | Scenario |
|---|---|
| `auth-and-create.spec.ts` | Login → create project → create item → run `simple-task` template → verify status badge=done |
| `workflow-builder.spec.ts` | Open `/workflows/new` → drag 5 node types → connect → save → reload → verify persisted shape |
| `human-gate.spec.ts` | Run `complex-feature` → wait `human.approval` node → click Approve → flow continue đến done |
| `ws-realtime.spec.ts` | 2 browser contexts. Tab1 update status item → Tab2 board phải update <1s qua WS |
| `cli-parity-smoke.spec.ts` | Spawn `bb item create` qua child_process → web hiện item realtime |

### 3.4 Setup Playwright fixtures

`web/e2e/fixtures.ts`:
- Reset DB trước mỗi scenario qua API helper `/api/v2/test/reset` (test-only endpoint, gate bằng env)
- Seed admin user + project
- Auth token inject vào storage state

**Gate exit Wave 3:**
```
cd web && npm run test && npx playwright test
```
5 scenarios pass; vitest coverage ≥60%.

---

## Wave 4 — CLI (~1 ngày)

**Goal:** vitest + msw cho mọi command, daemon smoke.

### 4.1 Setup vitest + msw

Cài vào `cli-ts`: `vitest`, `msw`, `@vitest/coverage-v8`.

`cli-ts/tests/setup.ts` — start msw server với fixture API responses.

### 4.2 Command unit tests (`cli-ts/tests/commands/`)

Mỗi file 1 command group:
- `item.test.ts` — list/create/show/update/run/approve/cancel/status
- `workflow.test.ts` — list/show/create/edit/import/export/run + YAML I/O
- `comment.test.ts` — list/add
- `daemon.test.ts` — start/stop/status

Mỗi command ≥2 case: happy + error (4xx, 5xx, network).

### 4.3 Integration (`cli-ts/tests/integration/`)

- `workflow-run.test.ts` — `bb item run <id> --workflow simple-task` với msw → assert request sequence khớp spec
- `daemon-cycle.test.ts` — daemon dequeue 1 item → execute (mocked Claude) → heartbeat → complete → mark device offline on shutdown
- `ws-reconnect.test.ts` — WS disconnect → reconnect logic, fallback poll 60s

**Gate exit Wave 4:**
```
cd cli-ts && npm run test -- --coverage
```
Coverage ≥70%.

---

## Wave 5 — Regression + Perf + Real Claude (~1.5 ngày)

### 5.1 Regression suite — `scripts/run-regression.py`

12 cases = {4 templates} × {auto, explicit, manual}.

```
templates = ["simple-task", "complex-feature", "bug-fix", "spike-research"]
modes     = ["auto", "explicit", "manual"]
```

Mỗi case:
1. Reset DB qua test endpoint
2. Tạo work_item với complexity matching mode
3. Trigger workflow theo mode
4. Drive đến terminal (mocked Claude, deterministic seed)
5. Assert golden snapshot: `(final_status, agent_session_count, token_range, files_modified, comments_posted)`

Output: JSON report `plans/reports/regression-{date}.json` với pass/fail + diff.

CI: nightly cron + on tag push.

### 5.2 Perf baseline — `scripts/perf-baseline.py`

- Spawn 50 concurrent `simple-task` workflow_runs (mocked Claude, latency 50ms)
- Đo: dequeue p50/p95/p99, full run duration, DB pool saturation, leaked connections
- Pass: p95 dequeue < 500ms, no deadlock, pool quay về 0 leak sau 30s
- Document số liệu vào `docs/architecture.md`

### 5.3 Real Claude smoke (Stage G — CRITICAL, manual)

Tạo project test riêng (token budget cap thấp). Chạy 4 templates lần lượt với real API:
1. `simple-task` — verify branch + commit + PR opened
2. `bug-fix` — verify root cause comment + fix commit
3. `complex-feature` — verify Lead delegate + human gate + parallel review
4. `spike-research` — verify writer output vào `docs/`

Edge cases ghi vào `docs/known-issues.md`.

### 5.4 CI pipeline — `.github/workflows/test.yml`

```yaml
name: test
on: [push, pull_request]
jobs:
  backend-test:
    run: cd api && pytest --cov --cov-fail-under=70
  frontend-unit:
    run: cd web && npm run test -- --coverage
  frontend-e2e:
    run: cd web && npx playwright test
  cli-test:
    run: cd cli-ts && npm run test -- --coverage
  regression:
    run: python scripts/run-regression.py
  type-check:
    run: cd api && mypy src/ && cd ../web && npx tsc --noEmit && cd ../cli-ts && npm run typecheck
  perf-smoke:
    run: python scripts/perf-baseline.py
```

Block merge nếu bất kỳ job fail. Flaky → rerun 3× rồi mới fail.

**Gate exit Wave 5 (= DoD final):**
- [ ] 4 templates real-Claude smoke pass
- [ ] 12 regression cases green
- [ ] p95 dequeue < 500ms với 50 concurrent
- [ ] Coverage: BE≥70, FE≥60, CLI≥70
- [ ] mypy + tsc clean
- [ ] `grep -r 'TODO\|FIXME\|HACK' api/src cli-ts/src web/src` = empty
- [ ] CI xanh trên main

---

## Lệnh chạy nhanh (cheat sheet)

```bash
# Backend full
cd api && pytest --cov=src --cov-report=term-missing

# Backend chỉ workflow
cd api && pytest src/workflow/tests tests/v2/workflow tests/v2/integration

# Frontend unit
cd web && npm run test

# Frontend E2E
cd web && npx playwright test --headed     # debug
cd web && npx playwright test                # CI

# CLI
cd cli-ts && npm run test -- --coverage

# Regression (cuối cùng)
python scripts/run-regression.py --report plans/reports/regression-$(date +%Y%m%d).json

# Perf
python scripts/perf-baseline.py --concurrency 50
```

---

## Phân chia delegate (nếu chạy parallel)

| Track | Wave | Owner suggested |
|---|---|---|
| A — Backend | Wave 1 + 2 | `tester` agent (pytest expert) |
| B — Frontend | Wave 3 | `tester` agent với Playwright skill |
| C — CLI | Wave 4 | `tester` agent vitest + msw |
| D — Regression/Perf/CI | Wave 5 | controller (cần real API key) |

File ownership boundaries (không chồng):
- Track A: `api/src/workflow/tests/`, `api/tests/v2/`
- Track B: `web/e2e/v2/`, `web/src/**/__tests__/`
- Track C: `cli-ts/tests/`
- Track D: `scripts/`, `.github/workflows/`

---

## Câu hỏi chưa giải

1. Có endpoint `/api/v2/test/reset` cho Playwright reset DB chưa? Nếu chưa, cần tạo (gate bằng `BB_TEST_MODE=1`).
2. Real Claude smoke (Stage G): API key + project test budget đã sẵn sàng?
3. `cli-parity-smoke.spec.ts` cần spawn `bb` binary — CI runner cần `npm link` cli-ts trước test?
4. Legacy `web/e2e/all-features.spec.ts` + `pipeline-settings.spec.ts` — giữ hay xóa? (chúng test pipeline cũ đã bỏ)
