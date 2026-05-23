# Phase 1 — Single-Agent E2E with Real LLM

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 1
- Reference architecture: [`../reports/architecture-260518-agent-orchestrator-framework.md`](../reports/architecture-260518-agent-orchestrator-framework.md)
- Standards research: [`../reports/researcher-260517-2010-agent-architecture-standards.md`](../reports/researcher-260517-2010-agent-architecture-standards.md)
- ECC evaluation: [`../reports/evaluation-260518-1725-everything-claude-code-applicability.md`](../reports/evaluation-260518-1725-everything-claude-code-applicability.md)
- Previous phase: [`./phase-00-greenfield-scaffold.md`](./phase-00-greenfield-scaffold.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🔴 Critical — replaces stub with real LLM execution |
| Status | 🚧 Scaffolded (~70%); harness + LangGraph traversal pending |
| Duration | 3 weeks |
| Acceptance | One issue end-to-end via real claude-cli call; full workflow node traversal; events written to canonical log; cost tracked accurately |

**Brief:** Replace harness canned stubs với real LLM execution (claude-cli subprocess). Wire LangGraph multi-node traversal (currently only triager runs). Build tool executor mapping registry → service functions. Swap MemorySaver → PostgresSaver. Adopt ECC's ToolResult schema + Prompt Defense Baseline.

---

## Key Insights

### From existing scaffold
- Harness stub at `bumblebee/services/execution/harness.py` returns canned per-role outputs — works for tests but blocks real demo
- WorkflowEngine builds LangGraph StateGraph but `workflow_runs.py` router bypasses it (only triggers triager manually)
- Tool Registry has 12 single-verb tools defined, no executor wires them to handlers
- Cost rates hardcoded in `budget_enforcer.estimate_cost()` — fine for now

### From ECC research
- **ToolResult schema** (adopt): `{status, summary, next_actions, artifacts}` — improves agent recovery + reduces context bloat
- **Prompt Defense Baseline** (6-line block): prepend every AgentDefinition prompt — battle-tested anti-injection
- **Action space quality** = #1 driver of agent success per ECC `agent-harness-construction` skill

### From plan §4.6 Memory Architecture
- Phase 1 implements **Tier 1 (Working) + Tier 2 (Compaction)** in harness
- Tier 3 (Scratch) tools defined, real persistence via `agent_session.scratch JSONB`
- Tier 4 (Checkpoint) = LangGraph PostgresSaver swap (Phase 1 day 14-15)
- Tier 5 (IssueMemory) projected by `issue_memory.py` — deferred full wiring to Phase 6

---

## Requirements

### Functional
- F1. Harness subprocess-spawns claude-cli with: prompt, tool definitions, working directory; pipes stdout
- F2. Harness emits structured events: `llm_call`, `tool_call`, `tool_result`, `cost_charged` to canonical event log
- F3. Tool executor: registry tool name → service function; validates args via JSON schema; returns `ToolResult`
- F4. WorkflowEngine drives LangGraph through ALL nodes per workflow YAML (not just triager stub)
- F5. AgentDefinition.prompt_template loaded into harness system prompt with Prompt Defense Baseline prefix
- F6. LangGraph state persisted via `PostgresSaver` (replace MemorySaver)
- F7. Cost tracker increments per LLM call with real token counts (from claude-cli output)
- F8. Compaction triggers at 80% context (configurable via PolicyConfig)
- F9. Workflow `simple-fix-flow.yaml` runs end-to-end: triage → implement → test → done (all 3 nodes execute)

### Non-functional
- N1. Single LLM call <60s p95 (assuming claude-cli reachable)
- N2. Tool execution <500ms p95 for fast tools (read_file, search_code)
- N3. Memory: harness process <500MB RSS during single workflow run
- N4. Workflow run survives server restart (PostgresSaver durability)

---

## Architecture

### Harness Real LLM Flow

```
WorkflowRun starts
   ↓
WorkflowEngine.invoke(workflow=simple-fix-flow, state={issue_id, ...})
   ↓
LangGraph node: triage (role=triager)
   ↓
Harness.run_role(session, role=triager, input_state)
   ├── ContextAssembler: build prompt
   │     = AgentDefinition.prompt_template (with Defense Baseline)
   │     + tool defs (filtered by role)
   │     + IssueMemory (Tier 5) - basic in Phase 1
   │     + scratch (Tier 3 if continuation)
   ├── budget check (BudgetEnforcer.check_session_budget)
   ├── spawn: subprocess.run(['claude', '-p', prompt, '--output-format', 'json'])
   ├── pipe stdout → parse → tool calls + final output
   ├── for each tool call: ToolExecutor.execute(name, args, session) → ToolResult
   │     - emit Event(tool_call) + Event(tool_result)
   │     - loop detector check
   ├── on completion: emit Event(session_completed)
   └── return HarnessResult(output, tokens_in, tokens_out)
   ↓
LangGraph state updated with result
   ↓
Next node (per workflow on_success): implement → test → done
```

### Tool Executor

```python
# bumblebee/services/tool/executor.py
class ToolExecutor:
    def __init__(self, registry, db_session):
        self._handlers = {
            "list_issues": self._list_issues,
            "get_issue": self._get_issue,
            "acquire_scope_lease": self._acquire_lease,
            "read_file": self._read_file,
            "write_file": self._write_file,
            "search_code": self._search_code,
            "git_commit": self._git_commit,
            # ...
        }
    
    async def execute(self, name: str, args: dict, session: AgentSession) -> ToolResult:
        # 1. Validate via registry schema
        ok, err = validate_tool_call(name, args)
        if not ok:
            return ToolResult(status="error", summary=err, ...)
        # 2. Dispatch
        handler = self._handlers.get(name)
        if not handler:
            return ToolResult(status="error", summary=f"no_handler: {name}", ...)
        # 3. Execute + wrap result
        try:
            result = await handler(args, session)
            return result
        except Exception as e:
            return ToolResult(status="error", summary=str(e), next_actions=["retry"], ...)
```

### ToolResult Schema (adopt from ECC)

```python
class ToolResult(BaseModel):
    status: Literal["success", "warning", "error"]
    summary: str          # one-line; goes into LLM context
    next_actions: list[str] = []  # actionable follow-ups
    artifacts: list[str] = []     # file paths, IDs
    data: dict | None = None      # raw output (NOT in context unless explicitly fetched)
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/services/execution/harness.py` | Replace stub with real claude-cli subprocess + ContextAssembler |
| `bumblebee/services/tool/registry.py` | Add ToolResult import + change return type docs |
| `bumblebee/routers/workflow_runs.py` | Remove direct triager call; use WorkflowEngine.invoke() |
| `bumblebee/services/control/workflow_engine.py` | Wire LangGraph compile + invoke for full graph; swap MemorySaver→PostgresSaver |
| `bumblebee/seeds/seed_default.py` | Update AgentDefinition prompt_template with Defense Baseline prefix |
| `tests/test_workflow_run.py` | Mock claude-cli subprocess for stub-mode tests |
| `pyproject.toml` | Add `langgraph-checkpoint-postgres` dep (already declared) |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/tool/executor.py` | ToolExecutor: map tool name → service function |
| `bumblebee/services/execution/context_assembler.py` | Build prompt with system + tools + memory + scope |
| `bumblebee/services/execution/llm_provider.py` | Provider abstraction (claude-cli, openai, gemini) |
| `bumblebee/services/execution/compaction.py` | Tier 2 compaction trigger at 80% context |
| `bumblebee/services/tool/result.py` | ToolResult Pydantic model |
| `bumblebee/services/tool/handlers/__init__.py` | Tool handler implementations (one fn per tool) |
| `bumblebee/services/tool/handlers/issues.py` | list_issues, get_issue, create_issue, update_issue_status |
| `bumblebee/services/tool/handlers/leases.py` | acquire_scope_lease, release_scope_lease |
| `bumblebee/services/tool/handlers/code.py` | read_file, write_file, search_code, git_commit, git_diff |
| `bumblebee/services/tool/handlers/scratch.py` | scratch_write, scratch_read |
| `bumblebee/services/tool/handlers/knowledge.py` | add_knowledge, query_knowledge |
| `bumblebee/services/tool/handlers/hitl.py` | request_human_approval, suggest_issue, suggest_knowledge_entry |
| `tests/test_harness_real.py` | Integration test with mocked claude-cli |
| `tests/test_tool_executor.py` | Unit tests for ToolExecutor + handlers |
| `tests/fixtures/claude_cli_mock.py` | Mock subprocess.run returning canned LLM responses |

### Delete

- (none — stub harness kept under feature flag for tests)

---

## Implementation Steps

### Week 1 — Foundation

1. **Day 1: ToolResult schema + handler scaffold**
   - Create `bumblebee/services/tool/result.py` with ToolResult model
   - Create `bumblebee/services/tool/handlers/__init__.py` + per-domain handler files (stubs)
   - Each handler: signature `async def handler(args: dict, session: AgentSession) -> ToolResult`

2. **Day 2: Tool Executor**
   - Create `bumblebee/services/tool/executor.py`
   - Register all handlers via dict
   - Add Event emission for tool_call + tool_result
   - Add loop_detector check before execution

3. **Day 3: Implement handlers**
   - issues.py: list_issues, get_issue, create_issue (already routes exist; call internal funcs)
   - leases.py: acquire/release (call LeaseManager)
   - scratch.py: read/write to AgentSession.scratch JSONB
   - knowledge.py: query (BM25 via `LIKE`/full-text search on KnowledgeEntry.body)
   - hitl.py: emit Event with type=chat_suggestion or status_change=needs_info

4. **Day 4: Code handlers**
   - read_file, write_file: workspace-scoped via session.workspace_path
   - search_code: ripgrep subprocess or Python `glob` + grep
   - git_commit, git_diff: subprocess git with workspace cwd

5. **Day 5: Tool executor tests**
   - `tests/test_tool_executor.py`: unit test each handler with mock workspace
   - Verify ToolResult shape across all handlers

### Week 2 — Harness + Provider

6. **Day 6: ContextAssembler**
   - `bumblebee/services/execution/context_assembler.py`
   - Builds: system_prompt (Defense Baseline + AgentDefinition.prompt_template) + tool_defs (role-filtered) + scope summary + Issue title/desc
   - Token estimation (rough): tiktoken or char/4 heuristic

7. **Day 7: Provider abstraction**
   - `bumblebee/services/execution/llm_provider.py`
   - `class ClaudeCLIProvider`: `async def invoke(prompt, tools) -> LLMResponse`
   - subprocess.run with timeout, parse JSON output
   - Capture: text response, tool_use blocks, token usage from claude-cli JSON

8. **Day 8: Harness real**
   - Replace `bumblebee/services/execution/harness.py` stub with real flow
   - Keep stub provider for tests under env flag `BUMBLEBEE_PROVIDER=stub`
   - Wire ContextAssembler + Provider + ToolExecutor

9. **Day 9: Compaction**
   - `bumblebee/services/execution/compaction.py`
   - Trigger when estimated_tokens / max > 0.8
   - Strategy: keep system + last 5 turns verbatim; summarize earlier turns
   - Emit Event(type=session_checkpointed) with compaction marker

10. **Day 10: Integration tests**
    - `tests/test_harness_real.py` with mocked claude-cli subprocess (fixture)
    - One test per role: triager, implementer, tester, reviewer

### Week 3 — LangGraph + PostgresSaver

11. **Day 11: Full LangGraph traversal**
    - Update `bumblebee/services/control/workflow_engine.py`:
      - `compile_workflow()` builds StateGraph with all nodes registered to harness.run_role
      - `invoke_workflow(workflow_run, initial_state)` calls compiled.ainvoke(state, config={"thread_id": run.id})
    - Update `bumblebee/routers/workflow_runs.py`:
      - Remove manual triager call
      - Call WorkflowEngine.invoke_workflow instead
      - Handle async generator if streaming

12. **Day 12: PostgresSaver swap**
    - `pip install langgraph-checkpoint-postgres` (already in pyproject)
    - In WorkflowEngine: replace `MemorySaver()` with `PostgresSaver.from_conn_string(database_url)`
    - PostgresSaver auto-creates `checkpoints` + `checkpoint_writes` tables on first use
    - Alembic: add migration to verify these tables exist post-run

13. **Day 13: End-to-end test**
    - Run simple-fix-flow on a real issue (manually verify with mock claude-cli)
    - Verify event log shows: workflow_started → 3 session sequences (triager/implementer/tester) → workflow_completed
    - Verify checkpoint rows in `checkpoints` table

14. **Day 14: Provider matrix prep**
    - Wire OpenAI + Gemini providers (stub-only, mark `coming_soon`)
    - Document provider selection: `PolicyConfig.default_provider` per project, override per agent

15. **Day 15: Acceptance + cleanup**
    - Run full test suite (target: 80+ tests pass)
    - Document harness in `docs/harness.md`
    - Update `docs/getting-started.md` with real-run example
    - Commit: `feat(phase-1): real claude-cli harness + full LangGraph traversal + PostgresSaver`

---

## Todo List

- [ ] ToolResult Pydantic model
- [ ] ToolExecutor + handler dispatch
- [ ] 12 tool handler implementations (issues/leases/scratch/knowledge/hitl/code)
- [ ] tests/test_tool_executor.py (unit, mock workspace)
- [ ] ContextAssembler with Defense Baseline prefix
- [ ] LLMProvider abstraction (claude-cli first)
- [ ] Harness real impl replacing stub
- [ ] Compaction Tier 2 trigger
- [ ] tests/test_harness_real.py (mocked claude-cli)
- [ ] WorkflowEngine: full graph traversal via LangGraph
- [ ] workflow_runs router: use WorkflowEngine.invoke
- [ ] MemorySaver → PostgresSaver swap
- [ ] End-to-end test: simple-fix-flow real run
- [ ] OpenAI + Gemini provider stubs
- [ ] docs/harness.md
- [ ] Acceptance: 80+ tests pass
- [ ] Phase 1 commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| Real claude-cli call returns within timeout | `tests/test_harness_real.py::test_real_run` |
| All workflow nodes execute (not just triager) | Event log shows 3 session_started/completed pairs for simple-fix-flow |
| ToolResult schema enforced across all handlers | tests verify status/summary fields |
| PostgresSaver durability | Restart server mid-workflow; resume from checkpoint |
| Compaction fires at 80% threshold | Event(session_checkpointed) emitted; context size reduces |
| Cost increments per LLM call | `cost_charged` events sum matches session.dollars_used |
| Loop detector breaks repeated tool+args | Already tested; verify still works post-executor |
| Workspace isolated per session | Different sessions write to different worktree branches |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| claude-cli not installed on dev machine | M | H | Document install (Phase 0 done); fallback stub provider for tests |
| claude-cli output format change | L | H | Pin claude-cli version range in docs; parse defensively |
| PostgresSaver migration auto-create conflict | M | M | Test on clean DB first; allow alembic to coexist with PostgresSaver tables |
| LangGraph state schema clash with our event log | M | M | Plan §10 risk noted; checkpoint = resume state, event log = canonical truth; clear separation enforced |
| Compaction loses critical context | M | H | Keep last N turns verbatim; protect "decision" + "goal" turns; eval gate before deploy |
| Tool handler bugs cascade across sessions | M | M | Each handler is async + transactional; rollback on exception |
| Subprocess deadlock (claude-cli hangs) | M | H | Wall-time timeout per session (60min default) + KillSwitch |

---

## Security Considerations

- **Prompt injection**: Defense Baseline prefix on all prompts; sanitize external content (URLs, user input) before context insertion
- **Tool argument validation**: strict JSON schema; reject invalid before handler execution
- **Workspace isolation**: per-session git worktree; absolute path check (no `../` escape)
- **Subprocess privilege**: claude-cli runs as same user (no sudo); workspace is sandboxed dir
- **Secrets in prompts**: never log full prompts at INFO level; redact ANTHROPIC_API_KEY env
- **Provenance tags**: tool results from external sources marked `external_unverified`

---

## Next Steps

**Unblocks:**
- Phase 2 (Safety + Observability): real cost data available for BudgetEnforcer tuning + OTel traces
- Phase 3 (ScopeLease): full workflow traversal needed for multi-issue tests
- Phase 4 (Coordinator): real LLM execution required for decomposition logic

**Depends on:**
- Phase 0 (Greenfield) — top-level `bumblebee/` package
- ECC adoption decision (D1-D5 from extensible-framework brainstorm)

---

## Unresolved Questions

1. **claude-cli output format stability** — JSON output (`--output-format json`) schema not formally documented. Pin tested version; defensive parse.
2. **PostgresSaver table prefix** — clash with our Alembic table names? Verify on day 12. May need to set `schema_prefix='langgraph_'`.
3. **Compaction loses tool call history** — should past tool_result events be included in compacted summary? Decision: yes, summarize key results in one line.
4. **Token estimation accuracy** — tiktoken vs char/4 heuristic. tiktoken adds ~20MB dep; char/4 within 15% accuracy. Start with char/4; upgrade if needed.
5. **Provider routing per-phase or per-session?** — plan says per-phase via workflow YAML. Validate UI/CLI override option in Phase 4.
