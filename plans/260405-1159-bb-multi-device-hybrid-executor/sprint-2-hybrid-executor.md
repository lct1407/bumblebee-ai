# Sprint 2 — Hybrid Executor (Remote for Read-Only Phases)

**Status**: pending
**Effort**: ~5 days (1 week)
**Depends on**: Sprint 1 complete (for safe multi-device operation)

## Problem

Current Bumblebee spawns Claude CLI **locally** for every phase. Wasteful for read-only reasoning phases (triage/analyze/review) that don't need filesystem access:

- Batch triage 100 items → sequential through local daemon (max_concurrent=2) → 50× slower
- Laptop sleeps during long analyze → session stuck
- User without desktop can't trigger triage/analyze

**Remote proxy** (Antigravity) solves these for read-only phases. Write phases (implement/test/fix/deploy) **stay local** — need DB/Docker/secrets/debug.

## Phase B1 — Executor Abstraction Interface

**Effort**: 2 days

### Design
Create common interface, 2 implementations:
```python
class AgentExecutor(Protocol):
    async def execute(self, prompt: str, context: ExecContext) -> SessionRef
    async def get_status(self, session_ref: SessionRef) -> ExecStatus
    async def stream_events(self, session_ref: SessionRef) -> AsyncIterator[Event]
    async def cancel(self, session_ref: SessionRef) -> None
```

### Implementations
1. **LocalDaemonExecutor** — enqueue to existing queue → device daemon dequeues (current behavior)
2. **RemoteProxyExecutor** — HTTP POST to Antigravity proxy, poll status

### Files to Create
- `api/src/services/executors/base.py` — Protocol + dataclasses
- `api/src/services/executors/local_daemon_executor.py` — wrap existing dispatch
- `api/src/services/executors/remote_proxy_executor.py` — new
- `api/src/services/executor_router.py` — choose based on phase + project config

### Refactor
- `pipeline_orchestrator.py` → delegate dispatch to `executor_router.dispatch(phase, item)`
- Existing WS relay logic unchanged for LocalDaemonExecutor
- RemoteProxyExecutor streams events via polling → emit same WS events

## Phase B2 — Remote Proxy Executor (Antigravity Client)

**Effort**: 2 days

### Config
```bash
ANTIGRAVITY_PROXY_URL=https://canawan.cleverbee.me/api/remoteai
ANTIGRAVITY_POLL_INTERVAL_SEC=3
ANTIGRAVITY_TIMEOUT_SEC=1800
```

### Implementation
```python
class RemoteProxyExecutor:
    async def execute(self, prompt, ctx):
        # Route to correct runner via affinity
        runner = await affinity.resolve(ctx.project_id)
        remote_project_id = runner.project_binding
        
        # Async chat
        resp = await http.post(f"{PROXY_URL}/chat", json={
            "projectId": remote_project_id,
            "message": prompt,
            "sync": False,
            "timeoutSeconds": 1800,
        })
        return SessionRef(backend="remote", request_id=resp["requestId"])
    
    async def stream_events(self, ref):
        while True:
            poll = await http.get(f"{PROXY_URL}/chat/status/{ref.request_id}")
            yield Event(status=poll["status"], content=poll.get("result", {}).get("response"))
            if poll["status"] in ("Completed", "Failed"):
                break
            await asyncio.sleep(3)
```

### Response Parsing
- Port `parseAntigravityResponse` from jarvis-agents (simplified — Python 50 lines)
- Handle: escaped code fences, "Copy" artifacts, broken lines
- Only needed for free-text output (triage/review); analyze returns structured JSON

### Structured Output Contract
- Each phase has JSON schema: triage returns `{complexity, priority, tags, summary}`
- Prompt includes schema: "Respond ONLY with JSON matching: ..."
- Validate response → fail fast if shape wrong → retry with clearer prompt

### Files to Create
- `api/src/services/executors/remote_proxy_executor.py` (~150 lines)
- `api/src/services/executors/response_parser.py` (~80 lines)
- `api/src/services/executors/phase_schemas.py` — Pydantic schemas per phase

## Phase B3 — Affinity Routing (Project→Runner Binding)

**Effort**: 1 day

### Why
Each Antigravity runner caches cloned repo + synced skills. If same project always routes to same runner → reuse cache → 10× faster (no re-clone).

### Schema
```sql
CREATE TABLE remote_runners (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  agent_id TEXT,
  max_projects INT DEFAULT 10,
  status TEXT DEFAULT 'offline',
  last_seen TIMESTAMPTZ,
  health_error TEXT
);

CREATE TABLE project_runner_bindings (
  project_id UUID NOT NULL REFERENCES projects(id),
  runner_id UUID NOT NULL REFERENCES remote_runners(id),
  remote_project_id TEXT NOT NULL,
  skills_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, runner_id)
);
```

### Resolve logic
```python
async def resolve_runner(project_id) -> RunnerBinding:
    # Prefer existing binding (warm cache)
    binding = await get_binding(project_id)
    if binding and binding.runner.status == 'online':
        return binding
    
    # Pick runner with lowest load
    runner = await find_available_runner(max_projects_check=True)
    if not runner:
        raise NoRunnerAvailable()
    
    # Create binding: init remote project, clone repo, sync skills
    remote_proj = await antigravity.create_project(agent_id=runner.agent_id)
    await antigravity.sync_skills(remote_proj.id)
    await save_binding(project_id, runner.id, remote_proj.id)
    return new binding
```

### Files to Create
- `api/src/services/runner_pool_service.py` (~120 lines)
- `api/src/routers/runners.py` — admin CRUD
- `api/alembic/versions/{rev}_add_remote_runners.py`

## Phase B4 — Phase-Based Executor Routing Config

**Effort**: 4 hours

### Per-project config
Extend `projects.pipeline_config`:
```json
{
  "enabled": true,
  "executor_routing": {
    "triage": "remote",
    "analyze": "remote",
    "review": "remote",
    "implement": "local",
    "test": "local",
    "fix": "local",
    "deploy": "local",
    "default": "local"
  }
}
```

### Router logic
```python
def route(phase: str, project: Project) -> ExecutorType:
    routing = project.pipeline_config.get("executor_routing", {})
    choice = routing.get(phase, routing.get("default", "local"))
    
    # Fallback: remote requested but unavailable → local
    if choice == "remote" and not runner_pool.any_online():
        log.warning(f"remote requested for {phase} but no runners, falling back to local")
        return "local"
    return choice
```

### Validation rules
- **Force local**: `implement`, `test`, `fix`, `deploy`, `release` cannot be remote (hardcoded guard)
- **Remote allowed**: `triage`, `analyze`, `review`, `qa_test` (read-only phases only)

### UI
- `/projects/{slug}/settings/pipeline` page: toggle per phase (local|remote)
- Write-phase toggles disabled + tooltip "requires local execution"

### Files to Modify
- `web/src/app/(main)/projects/[slug]/settings/pipeline/page.tsx`
- `api/src/services/executor_router.py` — add validation

## Sprint 2 Deliverables

- [ ] `remote_runners` + `project_runner_bindings` tables
- [ ] Executor Protocol + 2 implementations
- [ ] RemoteProxyExecutor with async chat + polling
- [ ] Response parser + structured output validation
- [ ] Affinity routing with warm cache reuse
- [ ] Per-phase routing config + UI
- [ ] Integration test: triage 20 items via remote in parallel, verify <2 min total
- [ ] Fallback test: kill all runners → auto-fallback to local

## Unresolved Questions

- Test account for Antigravity proxy? — verify works before building
- When Antigravity returns malformed response after 3 retries → fail item or fallback local?
- Should remote_project_id be revoked when project deleted? Call `antigravity.delete_project`?
