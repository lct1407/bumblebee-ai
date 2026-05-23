# Bumblebee architecture overview — for humans

This doc explains what Bumblebee is, how it's structured, and how it maps onto standard "AI agent framework" concepts you might know from Anthropic / LangChain / LangGraph / AutoGen / CrewAI. Written so a non-specialist can follow it.

> **TL;DR**: Bumblebee is a multi-agent issue tracker. Users file issues; the system runs LLM-powered agents in parallel to triage / plan / implement / test / review them. Architecture is split into **7 planes** that mirror the standard agent-framework reference design (Control / Dispatch / Execution / State / Safety / Tool / Observability). On top of that we layered a SaaS shell (workspaces, billing, MCP, etc.).

---

## 1. The 30-second pitch

Picture **Jira + Linear**, but every issue can be picked up by AI agents that actually do the work:

- A user files **"fix bcrypt cost factor too low"**
- A *Triager* agent classifies it (bug · high priority · 1 file affected)
- A *Planner* writes a 3-step plan
- An *Implementer* opens a git worktree, makes the change, commits
- A *Tester* runs the test suite
- A *Reviewer* (independent agent) approves the diff
- The system merges to `release/dev`

Each of those agents is a Claude / Gemini / GPT prompt + a permission scope. They run *concurrently* with file-level locks so two agents never touch the same file at the same time.

The product is sold as Bumblebee Cloud (multi-tenant SaaS) or self-hosted (pip package).

---

## 2. How it maps to standard agent-framework concepts

If you've read Anthropic's *"Building effective agents"* or LangChain docs, you've seen these primitives:

| Standard term | Bumblebee implementation | Where to find it |
|---|---|---|
| **Agent** | `AgentDefinition` row + a YAML prompt file | `bumblebee/prompts/<role>.yaml` (11 roles) |
| **Agent role/persona** | `role` field on AgentDefinition (`triager`, `planner`, `implementer`, etc.) | `bumblebee/prompts/triager.yaml` |
| **Context** | `Prompt` object built by `ContextAssembler` | `services/execution/context_assembler.py` |
| **System prompt** | `system:` field in role YAML, prepended with Defense Baseline | `bumblebee/prompts/_defense_baseline.yaml` |
| **Model** | `LLMProvider` abstraction — Stub / ClaudeCLI / Gemini | `services/execution/llm_provider.py` |
| **Harness** (run loop) | `Harness.run_role()` | `services/execution/harness.py` |
| **Tools** | `Skill` rows + `ToolExecutor` dispatch | `services/tool/registry.py` + `executor.py` |
| **Tool output schema** | `ToolResult` Pydantic model (status/summary/artifacts/next_actions) | `services/tool/result.py` |
| **Workflow / DAG** | `Workflow` model + LangGraph `StateGraph` | `bumblebee/workflows/*.yaml` + `services/control/orchestrator.py` |
| **Memory** (short-term) | `AgentSession.scratch` JSONB + `checkpoint_id` | `services/state/issue_memory.py` |
| **Memory** (long-term) | `KnowledgeEntry` table + `IssueMemory` projection | `services/state/issue_memory.py` |
| **Event log** | `events` table (append-only) | `services/state/event_log.py` |
| **Budget enforcement** | `BudgetEnforcer` (per session + issue + workspace) | `services/safety/budget_enforcer.py` |
| **Tool/skill registry** | `Skill` + `ToolRegistry` | `services/tool/registry.py` |
| **Prompt injection defense** | Defense Baseline prepended to every system prompt | `prompts/_defense_baseline.yaml` |
| **A2A communication** (agent-to-agent) | `AgentSession.causation_id` chains + event log | parent→child session linkage |
| **Eval harness** | YAML-driven scenario runner + judges | `bumblebee/eval/runner.py` + `bumblebee/prompts/validator.py` |
| **Observability** | Event log + OTel scaffolding | `services/state/event_log.py` (events table) |

If you've used these terms before, this is the cheat sheet. The rest of this doc explains them in context.

---

## 3. The 7-plane architecture

Bumblebee borrows the **7-plane** reference architecture (Anthropic + ECC industry consensus circa 2026). Each plane has one job; together they form a complete agent runtime.

```
┌────────────────────────────────────────────────────────────────────┐
│  USER / EXTERNAL AGENT (Claude Code, Cursor, custom MCP client)     │
│                                                                      │
│  HTTP REST  ·  WebSocket /ws  ·  MCP /mcp                            │
└──┬───────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. CONTROL PLANE   — Orchestrator (LangGraph)                       │
│     decides "what runs next" — workflow graph traversal              │
│     services/control/orchestrator.py · workflows/*.yaml              │
└──┬──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. DISPATCH PLANE  — Queue + ScopeLease                             │
│     decides "WHICH agent picks up this work, on what FILES"          │
│     services/dispatch/ · models/scope_lease.py                       │
│     Postgres SKIP LOCKED + file-glob exclusion                       │
└──┬──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. EXECUTION PLANE — Harness + LLM Provider + Context Assembler     │
│     actually CALLS the LLM, parses output, runs tool calls           │
│     services/execution/harness.py · llm_provider.py · context_assembler.py │
└──┬──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. STATE PLANE     — Event log + IssueMemory + KnowledgeEntry       │
│     append-only events table is THE source of truth                  │
│     services/state/event_log.py · models/event.py                    │
│     IssueMemory + Knowledge are derived projections                  │
└──┬──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. SAFETY PLANE    — Budgets · Loop detector · Failure classifier   │
│     stops the agent BEFORE it runs away with cost or loops           │
│     services/safety/                                                  │
└──┬──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. TOOL PLANE      — Skill registry + ToolExecutor                  │
│     declared tools with input/output JSON schemas                    │
│     services/tool/registry.py · executor.py · result.py              │
└──┬──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7. OBSERVABILITY   — Event log (canonical) + future OTel spans      │
│     every action is appended; UI reads + streams over /ws            │
│     services/state/event_log.py (dual-use: state + observability)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Why 7 planes (not just one big bag)?

Because each plane has a **completely different failure mode** and you want to fix them in isolation:

| Plane | If broken, you see… |
|---|---|
| Control | "Wrong agent ran next" / "Workflow stuck at step 3" |
| Dispatch | "Two agents edited the same file → merge conflict" |
| Execution | "Claude returned non-JSON" / "LLM call took 90s" |
| State | "Issue says complete but it isn't" / "Events lost" |
| Safety | "$500 bill from runaway loop" / "agent looped 200 times" |
| Tool | "Agent tried `rm -rf /`" / "tool returned malformed JSON" |
| Observability | "Can't tell what happened" / "no audit trail" |

Splitting them means you can swap out *just* the LLM provider (Execution plane) without touching the queue (Dispatch) or the event log (State).

---

## 4. The 5 commercial layers (Phase A–F)

On top of the 7-plane core engine, we layered the **SaaS shell**:

| Layer | Phase | What it adds |
|---|---|---|
| **Tenancy + RBAC** | A | `workspace_id` on every table, 4 roles, 21 permissions |
| **MCP server** | B | External agents (Claude Code, Cursor) call Bumblebee as a tool |
| **ECC standards** | C | 11 externalized YAML prompts, Defense Baseline, eval CI gate |
| **Billing + quotas** | D | Stripe Checkout, plan caps, metered passthrough |
| **Audit + DR + SOC2 prep** | E | Field-level event audit, WS auth, backup scripts, security docs |
| **Onboarding + pricing** | F | `/register`, `/login`, 4-step wizard, public `/pricing` |

Plus post-MVP polish: workspace settings UI, members management, in-app "What's new" modal consuming `/api/changelog`.

---

## 5. Tech stack in one table

| Layer | Choice | Why |
|---|---|---|
| Backend language | Python 3.13 | Anthropic SDK + LangGraph happy place |
| Web framework | FastAPI | Async, OpenAPI-native, fast |
| DB | PostgreSQL 17 | JSONB + SKIP LOCKED + RETURNING |
| ORM | SQLAlchemy 2.0 async | Type-safe, async, mature |
| Migrations | Alembic | Pairs with SQLAlchemy |
| Auth | JWT (jose) + bcrypt | Standard; OAuth2 via authlib |
| Workflow engine | LangGraph | Stateful, checkpointable, async |
| LLM providers | claude-cli, Vertex AI / Gemini, Stub | Pluggable via `LLMProvider` abstraction |
| Frontend | Next.js 16 (Turbopack) | RSC-ready, App Router |
| Frontend lang | TypeScript | Required for the ecosystem |
| UI primitives | Radix UI + cmdk + framer-motion | Composable, headless |
| Styling | Tailwind v4 + CSS variables | Token system for light/dark + brandability |
| Charts | Recharts | Reads our chart tokens for theme parity |
| State | TanStack Query | Server-state + invalidation |
| Realtime | Native WebSocket | `/ws?project=…&token=…` |
| Payments | Stripe Checkout + Webhooks | Hosted, lowest impl cost |
| MCP | Anthropic `mcp` Python SDK | Official Model Context Protocol implementation |
| Container | Docker multi-stage | Single image, multi-arch |
| Distribution | `pip install bumblebee-ai` | Self-host install + console_scripts |

---

## 6. Walk a concrete example: "fix bcrypt"

A user types this into the smart-create MCP tool from Claude Code:

> "fix bcrypt cost factor — too low for 2026 hardware"

What happens, plane by plane:

1. **MCP plane** receives the call, authenticates the API key, resolves it to (user, workspace, role).
2. **Tool plane** validates the args against `bumblebee_smart_create_issue`'s declared input schema.
3. **Execution plane** assembles a Prompt (system + user) and calls the Gemini provider.
4. Gemini returns a structured JSON draft. The tool wraps it in `ToolResult.ok(...)` per the Harness spec.
5. The user (or Claude Code itself) confirms — calls the same tool with `commit=true`.
6. **State plane** inserts an Issue row + an `issue_created` event.
7. **Control plane** (the pipeline orchestrator) sees a new issue and decides the next step: triage.
8. **Dispatch plane** enqueues a triage task. A worker dequeues with SKIP LOCKED.
9. **Safety plane** runs the budget check (workspace quota + per-session cap).
10. **Execution plane** loads the `triager.yaml` prompt + assembles context (issue + scope hints + relevant knowledge entries) + invokes claude-cli with streaming.
11. **Observability plane** broadcasts each LLM chunk over `/ws?project=...` so the web UI shows live progress.
12. **State plane** persists the result: complexity=simple, priority=high, summary set on the Issue.
13. **Control plane** decides next step: planner. Same loop.
14. Eventually an Implementer agent acquires a **ScopeLease** on `bumblebee/auth/security.py`, makes the change in a git worktree, commits.
15. A Tester agent runs pytest. A Reviewer approves. The Merger merges to `release/dev`.

Each of those steps is one event in the `events` table. The UI's Activity tab is just `SELECT * FROM events WHERE issue_id = X ORDER BY occurred_at`.

---

## 7. Where to go next

- Want to see what each table looks like → [database-schema.md](./database-schema.md)
- Want a sequence diagram for `POST /api/workflow-runs/trigger` → [flow-walkthroughs.md](./flow-walkthroughs.md)
- Want to read the actual code → start at `bumblebee/services/execution/harness.py:run_role` — that's the heart of the system
- Want to wire it into Claude Code → [mcp-integration.md](./mcp-integration.md)
- Want to brand the UI → [design-system.md](./design-system.md)

## Glossary

| Term | Meaning |
|---|---|
| **Workspace** | Top-level tenant boundary. A customer's account. Owns projects, members, billing. |
| **Project** | A repo/codebase within a workspace. Has its own issue numbering, agents, workflows. |
| **Issue** | A unit of work. Numbered per project (BB-1, BB-2, …). Status moves through a state machine. |
| **AgentDefinition** | The configuration of an agent (role, prompt, allowed tools, budgets). |
| **AgentSession** | One instance of an agent running on one issue. Has a status (running/completed/failed), tokens, cost. |
| **Workflow** | A LangGraph YAML defining which agents run in what order (e.g. `simple-fix-flow`). |
| **WorkflowRun** | One execution of a Workflow against an Issue. Has many AgentSessions. |
| **ScopeLease** | A pessimistic lock on a file-glob, held by an AgentSession. Prevents two agents from racing on the same files. |
| **Event** | An immutable audit row. Anything that happens (status change, LLM call, tool call, scope acquired, …) becomes an Event. |
| **KnowledgeEntry** | A reusable fact about the codebase (convention, decision, pitfall). Loaded into context. |
| **IssueMemory** | A derived projection — Episodic (recent events) + Semantic (cached summary) per issue. Fed back into the Implementer's context on the next round. |
| **MCP** | Model Context Protocol — Anthropic standard for exposing tools to external LLMs (Claude Code, Cursor, Desktop). |
| **ToolResult** | The standard shape every tool call returns: status / summary / artifacts / next_actions / data. Borrowed from ECC. |
| **Defense Baseline** | A system-prompt prefix prepended to every agent. Blocks injection, role override, schema bypass. |
