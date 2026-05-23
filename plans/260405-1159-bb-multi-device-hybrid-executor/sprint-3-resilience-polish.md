# Sprint 3 — Resilience + Polish

**Status**: pending
**Effort**: ~4 days
**Depends on**: Sprint 1, partially Sprint 2

## Phase C1 — Per-Work-Item Cost Tracking + Budget Guard

**Effort**: 1 day

### Why
`AgentSessionCost` already tracks cost per session. But a single work item runs **multiple sessions** (triage → analyze → implement → test → fix → deploy) — user has no rollup view of total cost per item. Also no budget guard to stop runaway items.

### Goals
- Show **total cost per work item** across all phases
- Compare **estimated vs actual** (estimate from complexity class)
- **Budget guard**: stop auto-pipeline if item exceeds N× estimate
- **Project budget**: monthly cap, alert at 80%, stop at 100%

### Files to Modify
- `api/src/services/cost_service.py` — add aggregation functions:
  - `async def get_work_item_cost(item_id) -> WorkItemCostBreakdown`
  - Returns: `{total_usd, by_phase: {triage: X, analyze: Y, ...}, session_count, tokens}`
- `api/src/routers/agent_costs.py` — new endpoint `GET /work-items/{id}/cost`
- `api/src/services/pipeline_orchestrator.py` — budget gate in `on_status_change`
- `web/src/features/work-items/detail/metadata-sidebar.tsx` — show cost row

### Schema additions
```sql
ALTER TABLE work_items ADD COLUMN estimated_cost_usd NUMERIC(10,4);
ALTER TABLE work_items ADD COLUMN max_cost_usd NUMERIC(10,4);  -- hard cap
ALTER TABLE projects ADD COLUMN monthly_budget_usd NUMERIC(10,2);
```

### Estimation logic
Complexity-based estimates (derived from historical data, refine over time):
```python
ESTIMATES = {
    "simple":  {"avg": 0.15, "p95": 0.40},
    "medium":  {"avg": 0.60, "p95": 1.80},
    "complex": {"avg": 2.50, "p95": 7.00},
}
# max_cost_usd = p95 × 2 (safety buffer)
```

### Budget guard
```python
async def can_continue_pipeline(item_id) -> (bool, str):
    actual = await get_work_item_cost(item_id)
    if item.max_cost_usd and actual.total_usd >= item.max_cost_usd:
        return False, f"item exceeded max ${item.max_cost_usd}"
    project_spent = await get_project_month_spend(item.project_id)
    if project.monthly_budget_usd and project_spent >= project.monthly_budget_usd:
        return False, f"project hit monthly budget"
    return True, None
```

### UI
- Work item detail sidebar: `Cost: $0.42 / $2.00 estimate (triage $0.02, analyze $0.08, implement $0.32)`
- Project dashboard: monthly spend bar + top-10 most expensive items
- Warning badge on items > p95 estimate

### WS event
- `work_item:cost_updated` broadcast after each session complete

## Phase C2 — Session Checkpoints + Device Failover

**Effort**: 2 days

### Problem
Device crashes mid-execute → session orphaned → item stuck `running` → user manual cancels → waste tokens.

### Solution
Periodic checkpoint writes during execution:
```sql
CREATE TABLE session_checkpoints (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  step_name TEXT NOT NULL,
  context_summary TEXT,
  files_modified JSONB,
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Flow
- Agent writes checkpoint after each major tool call (edit, test run, commit)
- `session_watchdog` (extends existing `stale_session_scanner`):
  - Every 60s, scan sessions with `last_heartbeat < now() - 90s`
  - Mark session `orphaned`, release work item lock
  - Re-enqueue item with `retry_from_checkpoint=true`
- Next device picks up: load latest checkpoint, resume with context injected in prompt preamble

### Files to Modify
- `api/src/services/agent_session_service.py` — add `record_checkpoint()`
- `api/src/tasks/session_watchdog.py` (extend existing scanner)
- CLI daemon — call `record_checkpoint` after each phase subcommand completes

## Phase C3 — Provider Quota Cache + Status Polling Fallback

**Effort**: 1 day

### C3a — Provider quota cache (from predecessor plan)
- Background poller every 15 min per provider (Anthropic, LiteLLM)
- `GET /api/providers/{id}/quota` returns in-memory cache (non-blocking)
- `POST /api/providers/{id}/quota/refresh` force-refresh
- UI: segmented quota bar per model (full/warning/empty)
- WS broadcast on refresh

### C3b — Session status polling fallback
- `GET /api/agent-sessions/{id}/status` endpoint (cheap indexed read)
- Frontend hook: detects WS disconnect → polls every 5s
- Stops polling on terminal status or WS reconnect

### Files
- `api/src/services/provider_quota_service.py` (~120 lines)
- `api/src/routers/provider_quota.py` (2 endpoints)
- `api/src/routers/agent_sessions.py` — add `/status` endpoint
- `web/src/hooks/use-agent-session-stream.ts` — poll fallback

## Phase C4 — Git URL Helpers (SSH→HTTPS)

**Effort**: 2h

- `cli/src/bumblebee/utils/git_url.py` — regex-based converter
- Call before any `git clone` in worktree path
- Optional: inject `GITHUB_TOKEN` env as basic auth for private repos
- Unit tests: 4 URL formats

## Phase C6 — Rate Limit Detection + Countdown UI

**Effort**: 1 day

### Why
C3 polls org-level quota every 15 min (proactive). But **per-minute rate limits** are enforced per-request via Anthropic headers. Need real-time parsing + countdown so dispatchers know when to pause.

### Claude API headers (every request)
```
anthropic-ratelimit-requests-remaining: 45
anthropic-ratelimit-requests-reset: 2026-04-05T15:00:00Z
anthropic-ratelimit-tokens-remaining: 38400
anthropic-ratelimit-tokens-reset: 2026-04-05T15:00:00Z
retry-after: 42  (only on 429)
```

### Schema
```sql
CREATE TABLE provider_rate_limits (
  provider_id TEXT PRIMARY KEY,
  requests_remaining INT,
  requests_reset_at TIMESTAMPTZ,
  tokens_remaining BIGINT,
  tokens_reset_at TIMESTAMPTZ,
  last_429_at TIMESTAMPTZ,
  retry_after_sec INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Token usage rollup endpoint
`GET /api/providers/{id}/usage?window=hour|day|week|month` returns:
```json
{
  "window": "day",
  "total_tokens": 1_240_000,
  "by_model": {"claude-sonnet-4-6": 800000, "claude-haiku-4-5": 440000},
  "by_provider": {"anthropic": 1240000},
  "session_count": 147
}
```

### Status states
- `healthy`: remaining > 20% — green
- `warning`: remaining 5-20% — yellow + show countdown
- `throttled`: remaining < 5% — red, auto-pause dispatches
- `blocked`: within retry-after window — hard stop, countdown to retry

### Dispatch gate extension
```python
async def can_dispatch(device, estimated_tokens, provider):
    # ...existing checks...
    rl = await get_rate_limit(provider)
    if rl.last_429_at and (now() - rl.last_429_at).seconds < rl.retry_after_sec:
        remaining = rl.retry_after_sec - (now() - rl.last_429_at).seconds
        return False, f"provider rate-limited, retry in {remaining}s"
    if rl.tokens_remaining and rl.tokens_remaining < estimated_tokens * 2:
        return False, f"tokens low ({rl.tokens_remaining} remaining)"
    return True, None
```

When blocked → work items stay in queue, dashboard shows "paused, resumes in MM:SS" banner.

### Files to Create
- `api/src/services/rate_limit_tracker.py` (~80 lines)
  - `parse_claude_headers(response) -> RateLimitSnapshot`
  - `async def update_rate_limit(provider, snapshot)` + WS broadcast
  - `async def get_rate_limit(provider) -> RateLimitSnapshot`
- `api/src/routers/provider_usage.py` — usage rollup + rate-limit endpoints
- `web/src/components/rate-limit-badge.tsx` (~60 lines)
  - Countdown timer (ticks every 1s locally)
  - Color + tooltip with breakdown
- `web/src/hooks/use-rate-limit.ts` — WS subscribe + local countdown decrement

### Files to Modify
- Hook into Claude API client: extract headers after every call → `update_rate_limit`
- Extend dispatch gate in `device_service.can_dispatch` (A4)
- Top nav bar: mount `<RateLimitBadge provider="anthropic" />`

### WS events
- `rate_limit:updated` — provider snapshot changed
- `rate_limit:throttled` — provider entered throttled state
- `rate_limit:recovered` — provider back to healthy

## Phase C5 — RAG Contextual Prefix

**Effort**: 4h

### Why
Anthropic's Contextual Retrieval: +35% retrieval accuracy by prepending chunk context before embedding.

### Change
In `api/src/services/rag_service.py`:
- Before upsert, prepend 1-2 sentence context:
  - Work item: `"This is a {type} item in project {project_name} titled: {title}"`
  - Comment: `"This is a comment on work item BB-{number} ({item_title}) about: {body_summary}"`
- No schema change, no new infra

### Trade-off
- Cost: +1 tiny LLM call (Haiku) per chunk at index time
- Benefit: +35% retrieval accuracy on dev task queries
- Skip LLM call for items where context is obvious (just concat fields)

### Files to Modify
- `api/src/services/rag_service.py` — add `_build_contextual_prefix(item, chunk)` helper

## Phase C7 — E2E Integration Tests (Full Multi-Device Flow)

**Effort**: 2-3 days
**Depends on**: all of Sprint 1 + Sprint 2 + C1-C6 complete

### Why
Individual phase tests exist, but no end-to-end validation of the **full pipeline across N devices**. Need to prove the whole system before rolling to users.

### Test scenarios

**Scenario 1 — 3 Devices, 10 Items, Zero Collisions**
- Spin up 3 CLI daemons against same project
- Enqueue 10 work items with mix of simple/medium/complex
- Assert:
  - Each item dispatched to exactly 1 device (no dual-dispatch)
  - Branch names all unique (query `branch_allocations`)
  - No worktree path conflicts (check filesystem)
  - All 10 items reach terminal status within timeout
  - Merge queue processes serially (check `merge_queue.started_at` ordering per repo)

**Scenario 2 — Device Crash Mid-Execute → Failover**
- Enqueue item, wait for device A to start implement
- Kill device A process SIGKILL mid-execution
- Assert:
  - `session_watchdog` marks session orphaned within 90s
  - Work item returns to queue with `retry_count=1`
  - Device B picks up, loads checkpoint, resumes
  - Final output includes files from both A's and B's checkpoints

**Scenario 3 — Remote Executor (Hybrid Routing)**
- Enqueue item on project with `executor_routing.triage=remote`
- Assert:
  - Triage phase dispatched via RemoteProxyExecutor to Antigravity proxy
  - Async chat + polling cycle completes
  - Response parsed, structured output matches phase schema
  - Implement phase dispatched LOCAL (guardrail enforced)
  - Fallback: kill all remote runners → triage falls back to local

**Scenario 4 — Rate Limit Throttle**
- Mock Claude API 429 response with `retry-after: 30`
- Assert:
  - `rate_limit_tracker` records 429 + retry_after
  - Subsequent dispatch gate blocks with "retry in Xs"
  - Dashboard shows countdown badge
  - After 30s, dispatches resume automatically

**Scenario 5 — Cost Budget Hit**
- Set work item `max_cost_usd=0.10`
- Enqueue item with complexity=complex (expects >$0.10)
- Assert:
  - Pipeline pauses after first phase when cumulative cost exceeds max
  - Item status transitions to `on_hold`
  - WS emits budget alert
  - User can raise budget + resume

**Scenario 6 — Full Auto-Pipeline End-to-End**
- Create simple work item with repo + test suite
- Enable all pipeline steps auto
- Assert completes: `new → triaged → planned → approved → in_progress → in_review → deploying → testing → staging → released → closed`
- No manual intervention required
- Total cost within expected range
- All events tracked in work_item_events

### Infrastructure
- Docker compose test harness: API + 3 CLI daemon containers + postgres + test repo
- Mock Anthropic API server (intercept + return controlled responses)
- Mock Antigravity proxy server (for remote executor tests)
- Test fixtures: sample repo with known-good test suite

### Files to Create
- `tests/e2e/test_multi_device_concurrent.py` — scenarios 1-2
- `tests/e2e/test_remote_executor.py` — scenario 3
- `tests/e2e/test_rate_limit_throttle.py` — scenario 4
- `tests/e2e/test_cost_budget.py` — scenario 5
- `tests/e2e/test_full_auto_pipeline.py` — scenario 6
- `tests/e2e/fixtures/` — test repo, mock servers, docker-compose.e2e.yml
- `tests/e2e/helpers/device_simulator.py` — spawn/kill daemon processes
- `tests/e2e/helpers/mock_anthropic.py` — controllable API mock

### CI integration
- New GitHub Actions workflow `.github/workflows/e2e.yml`
- Runs on PR + nightly
- 15-min timeout per scenario
- Artifact upload on failure (logs, DB dump, worktree state)

### Success Criteria
- All 6 scenarios pass green 3 consecutive runs
- No flakiness (>95% pass rate over 20 runs)
- Full suite completes in <30 min
- Provides runbook for debugging each scenario

## Sprint 3 Deliverables

- [ ] Work item cost rollup endpoint + UI
- [ ] Budget guards (per-item max, project monthly)
- [ ] Session checkpoints + orphan recovery
- [ ] Provider quota cache + UI bars
- [ ] Session status polling fallback
- [ ] Git URL coercion utility
- [ ] RAG contextual prefix
- [ ] Rate limit parser + countdown UI + dispatch gate integration
- [ ] E2E integration tests (6 scenarios) + CI workflow

## Unresolved Questions

- Cost estimation: use hardcoded table vs ML model trained on historical data? Start hardcoded.
- Checkpoint storage: DB column vs separate table? Separate table (granular history).
- Budget exceeded action: pause item (status=on_hold) or fail it? Pause (reversible).
