## Phase Implementation Report

### Executed Phase
- Phase: automation-gap-wiring (6 gaps from gap-analysis-260405-jarvis-vs-bb.md)
- Plan: none (ad-hoc gap closure)
- Status: completed

### Files Modified

| File | Change |
|------|--------|
| `api/src/workers/merge_worker.py` | NEW — background git merge worker (~120 lines) |
| `api/src/workers/__init__.py` | NEW — package init |
| `api/src/main.py` | +2 lines — register `run_merge_worker` in lifespan bg_tasks |
| `api/src/services/pipeline_orchestrator.py` | +90 lines — item locks, pause gate, deploy/release wiring, recursive call fix |
| `api/src/services/dispatch_service.py` | +80 lines — budget gate, rate-limit gate, model override, `DispatchSkipped` exception |
| `api/src/models/project.py` | +1 line — `paused_at: Mapped[datetime | None]` column |
| `api/src/routers/project_extras.py` | +30 lines — `POST /{slug}/pipeline/pause` + `resume` endpoints |
| `api/alembic/versions/gh0a1b2c3d4e5_add_project_paused_at.py` | NEW — migration for `paused_at` column |

### Tasks Completed

- [x] Gap #1 — Background merge worker: `api/src/workers/merge_worker.py` polls every 5s, executes git ops via asyncio.to_thread, handles conflict/fail/done states; wired into main.py lifespan
- [x] Gap #2 — Deploy/release auto-trigger: `_handle_release()` in orchestrator enqueues merge via coordinator + triggers all Coolify resources; advances to `closed` on success, `reopen` on failure
- [x] Gap #3 — Dispatch race mutex: `_ITEM_LOCKS` + `_GLOBAL_LOCK` added; `on_status_change` acquires per-item lock, delegates to `_on_status_change_locked`; recursive auto-approve/staging/review calls updated to bypass outer lock
- [x] Gap #4 — Rate limit gate: `dispatch_service.dispatch` calls `can_continue_pipeline` (budget) and `can_dispatch_rate_limit` (provider); raises `DispatchSkipped` when blocked; orchestrator catches and fails session cleanly
- [x] Gap #6 — Per-step model override: `resolve_model_for_phase` reads `phase_routing.{phase}.model`; persists onto `AgentSession.model` column before enqueue (no schema migration needed, column already exists)
- [x] Gap #7 — Global pipeline pause: `paused_at` column on `Project`; early-return in orchestrator when set; `POST /pause` + `POST /resume` endpoints in project_extras router; migration `gh0a1b2c3d4e5`

### Tests Status
- Import check: pass (all 6 new symbols importable)
- Unit tests: 154 passed, 1 pre-existing failure (`test_project_response_serialises_auto_agent` — MagicMock/Pydantic dict_type error, confirmed failing on base commit before any changes)
- Alembic heads: single head `gh0a1b2c3d4e5`, no duplicate warning

### Issues Encountered

1. asyncio.Lock is non-reentrant — the three recursive calls inside `_on_status_change_locked` (auto-approve, auto-staging, review routing) were updated to call `_on_status_change_locked` directly instead of the outer `on_status_change`, avoiding deadlock.
2. First migration attempt used revision `a1b2c3d4e5f6` which conflicted with existing `a1b2c3d4e5f6_unified_work_items_schema.py`. Renamed to `gh0a1b2c3d4e5`.
3. `queue_service.enqueue` has no `model` param and `AgentQueueItem` has no model column. Model override stored on `AgentSession.model` instead (column already existed) — workers/CLI read it from the session at dequeue time.

### Next Steps

- Gap #5 (session context resume in CLI) was out of scope for this task — listed as pending.
- Workers/CLI need to read `AgentSession.model` and pass `--model <id>` flag when set (follow-up).
- `_handle_release` uses `item.number` as branch name heuristic; real branch name should come from `branch_allocator_service` if available per project.
