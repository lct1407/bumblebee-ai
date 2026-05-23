# Phase 2 — Workflow Engine

**Track:** A (backend) | **Effort:** 2 weeks | **Status:** pending | **Depends:** P1

## Context

Workflow-as-data executor. State machine that consumes YAML/JSON definitions, evaluates triggers/conditions, spawns agent sessions, persists run state.

## Requirements

- Pydantic models for workflow definition (nodes + edges + triggers)
- 8 node type executors (MVP scope, no more)
- Async runtime: dispatcher + per-node worker
- Persistence: `workflow_runs.current_node_ids`, `state` (running/paused/completed/failed/cancelled), `context` (JSONB shared blackboard)
- Resume after restart (durable workflow runs)
- Expression evaluator: boolean ops only (`==, !=, <, >, &&, ||`) on context fields
- Loop guards: `max_loops` per edge, global `max_node_executions = 50` per run
- Trigger router: react to `item.status_change`, `item.created`, manual API, scheduled cron
- API endpoints: trigger run, pause, resume, cancel, fetch state

## File Ownership

```
api/src/workflow/
  definition.py        — Pydantic models for YAML schema
  validator.py         — Pre-save validation (cycle detect, missing edges, expression syntax)
  executor.py          — Main runtime dispatcher
  context.py           — Run context (JSONB blackboard) read/write helpers
  expression.py        — Boolean expression evaluator (safe, no eval)
  triggers.py          — Trigger router
  nodes/               — Node executors (1 file per type)
    base.py            — NodeExecutor ABC
    trigger_node.py
    agent_node.py
    parallel_node.py
    condition_node.py
    human_approval_node.py
    git_node.py
    update_node.py
    delay_node.py
  loader.py            — YAML/JSON workflow load + version pin
  templates/           — 4 built-in workflow YAMLs
    simple-task.yaml
    complex-feature.yaml
    bug-fix.yaml
    spike-research.yaml
api/src/api/workflow_runs.py   — REST endpoints
```

**Boundary:** Track A only. No web/cli changes.

## Workflow Definition Schema

```python
class WorkflowNode(BaseModel):
    id: str
    type: Literal["trigger.manual", "trigger.item_created", "trigger.status_change",
                  "trigger.schedule", "agent.run", "agent.parallel", "condition.if",
                  "human.approval", "git.branch", "git.commit", "git.open_pr",
                  "git.merge", "update.status", "update.field", "delay.wait"]
    config: dict  # type-specific

class WorkflowEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    when: str | None = None        # expression evaluated against context
    max_loops: int = 1

class WorkflowDefinition(BaseModel):
    name: str
    version: int
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
```

## Node Executor Contract

```python
class NodeExecutor(ABC):
    type: ClassVar[str]
    @abstractmethod
    async def execute(self, run: WorkflowRun, node: WorkflowNode, ctx: dict) -> NodeResult:
        ...
    # NodeResult: { status: ok|paused|failed, output: dict, next_edges_filter: callable | None }
```

## Implementation Steps

1. **Pydantic schema** — `definition.py` with full type union
2. **Validator** — cycle detection (DFS), reachability, expression parse, max-loops sanity
3. **Expression evaluator** — `expression.py` with whitelist parser (no `eval`/`exec`); supports `field op value` + `&&` `||`; tests for injection
4. **Loader** — load YAML/JSON, pin to version, store in DB
5. **Executor core** — `executor.py`:
   - Pop ready node from current_node_ids
   - Resolve executor class by `type`
   - Call `execute()`, persist result + new ctx
   - Compute next nodes from edges where `when` matches
   - Update `current_node_ids` atomically (DB transaction)
   - Loop until empty or paused
6. **8 node executors:**
   - `trigger_*` — fired by external (router calls executor with trigger payload)
   - `agent.run` — create `agent_session` row, enqueue queue_item, return paused; resumed by session completion webhook
   - `agent.parallel` — spawn N child sessions, wait all (paused state, resumed when last child completes)
   - `condition.if` — evaluate expr, set output `branch_taken`
   - `human.approval` — pause, wait for `POST /workflow_runs/{id}/approve`
   - `git.*` — call git CLI in worktree (P3 wires actual subprocess)
   - `update.*` — mutate `work_items` row + log event
   - `delay.wait` — schedule resume at `now + N`
7. **Trigger router** — `triggers.py` listens to event bus (status changes, manual API)
8. **REST endpoints** — `api/workflow_runs.py`:
   - `POST /workflow_runs` — start run (item_id + workflow_name)
   - `GET /workflow_runs/{id}` — current state + node statuses
   - `POST /workflow_runs/{id}/approve` — resume from human gate
   - `POST /workflow_runs/{id}/cancel`
   - `POST /workflow_runs/{id}/retry-node/{node_id}`
9. **WS broadcast** — emit `run:{id}` channel events on every state change
10. **4 templates** — write canonical YAML for each
11. **Tests:**
    - Unit per node executor (24 tests min: 8 nodes × 3 cases each)
    - Validator tests (cycles, missing edges, bad expression)
    - Integration: run `simple-task.yaml` with mocked agent, verify done state
    - Integration: pause/resume across restart (kill executor mid-run, restart, verify continuation)
    - Loop guard test (infinite cycle blocked at `max_node_executions`)

## Todo

- [ ] `definition.py` Pydantic models
- [ ] `validator.py` + tests (cycle, expr, edges)
- [ ] `expression.py` safe evaluator + tests (injection)
- [ ] `loader.py` YAML/JSON
- [ ] `executor.py` dispatcher loop
- [ ] 8 node executor files
- [ ] `triggers.py` event router
- [ ] `api/workflow_runs.py` REST endpoints
- [ ] WS event broadcast hook
- [ ] 4 template YAMLs
- [ ] Unit tests (24+ for nodes, full validator)
- [ ] Integration: simple-task end-to-end (mock agent)
- [ ] Integration: durability (restart resume)
- [ ] Integration: loop guard

## Success Criteria

- [ ] `simple-task.yaml` runs end-to-end with mocked agent → status `done`
- [ ] `complex-feature.yaml` pauses at human.approval, resumes on POST approve
- [ ] Restart mid-run: state recovered, continues where left off
- [ ] Infinite loop blocked at 50 executions, run marked failed
- [ ] Test coverage ≥ 75% for `api/src/workflow/`
- [ ] Validator catches: cycle, missing edge target, invalid expression, undefined node type
- [ ] CLI smoke (P5 dependent, deferred): `bb workflow run` triggers via API

## Risks

- Async race in `current_node_ids` update → use DB row lock (`SELECT ... FOR UPDATE`)
- Long-running `agent.run` blocks executor → executor returns paused, queue worker drives completion
- Expression injection → whitelist parser only, no Python eval
