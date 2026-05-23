# Phase 4 — Web MVP + Coordinator (multi-specialist parallel)

## Context Links

- Master plan: [`plan.md`](./plan.md) v1.1.1 §8 Phase 4 + §4.3 Scenario C walkthrough
- Forge UX patterns: [`../reports/comparison-260518-0125-forge-vs-bb-v3.md`](../reports/comparison-260518-0125-forge-vs-bb-v3.md)
- Previous: [`./phase-03-multi-issue-scope-lease-plugin-loader.md`](./phase-03-multi-issue-scope-lease-plugin-loader.md)

---

## Overview

| Field | Value |
|---|---|
| Priority | 🔴 Critical — main visible deliverable + multi-agent showcase |
| Status | ⏳ Not started — Coordinator role + Web absent |
| Duration | 2.5 weeks |
| Acceptance | One Complex issue decomposed into 3+ specialist sub-tasks running parallel, integrated via web UI; user can view stream live |

**Brief:** Build **Coordinator** role (decomposition + integration) + **Integrator** role (branch merging). Implement Scenario C from plan §4.3. Ship **Next.js web MVP**: issue list/detail + agent stream viewer + queue view + scope lease visualizer. Web pulls from REST + WebSocket.

---

## Key Insights

### Coordinator decomposition
- Coordinator session takes triaged issue → decomposes into N disjoint sub-issues (each child of parent issue)
- Each sub-issue has its own `scope_hints` (file globs) explicitly disjoint
- Coordinator dispatches via TaskQueue.enqueue for each sub-issue
- Coordinator session waits (or polls) for all sub-tasks → integrate

### Scenario C flow
```
T+0   Issue created (Complex)
T+5   Triager → complexity=Complex
T+15  Coordinator decomposes → 4 sub-issues (BB-N/backend, ui, tests, docs)
T+16  4 Implementer sessions dispatched in parallel; each acquires scope_lease
T+45  Each completes on own branch → emit subtask_complete
T+90  Coordinator resumes, calls Integrator to merge branches
T+100 Reviewer runs on integrated branch
T+110 Done
```

### Web MVP scope (minimum)
- Pages: dashboard, project, issue list, issue detail, agent stream, queue, scope lease viz
- NOT in MVP: settings, chat (Phase 7), notifications panel (Phase 7), replay debugger (Phase 7)
- Stack: Next.js 16 + Tailwind v4 + shadcn/ui + React Query + WebSocket client

### Forge adoption
- AgentDefinition entity (template/instance split) — already in model; wire fully here
- Issue.ai_confidence — already in model; populate in Triager

---

## Requirements

### Functional
- F1. Coordinator role: decomposition prompt + dispatcher logic
- F2. Coordinator session waits for sub-tasks completion (via event subscription or DB polling)
- F3. Integrator role: merge specialist branches + handle conflicts (escalate to coordinator)
- F4. Multi-specialist parallel: N implementer sessions on sibling worktree branches
- F5. AgentDefinition lookup at session start: fetch prompt_template + default_tools + default_budgets
- F6. Issue.ai_confidence populated by Triager; low value (<0.5) forces human review gate
- F7. Web app: issue list with filters (status, priority, type)
- F8. Web app: issue detail with metadata + scope hints + decomposition tree
- F9. Web app: agent stream viewer (live WebSocket; groups events into chat-like messages)
- F10. Web app: queue view (pending/running/done/failed)
- F11. Web app: scope lease visualizer (current active leases by file)
- F12. WebSocket `/ws?project={slug}` broadcasts agent:* + queue:* + lease:* events
- F13. Web auth: API key in localStorage (sufficient for v3.0 single-tenant)

### Non-functional
- N1. Web TTFB <500ms on dashboard
- N2. Agent stream latency <1s from event emit to web render
- N3. Coordinator decomposition LLM call <120s p95
- N4. Web bundle <500KB initial JS

---

## Architecture

### Coordinator Decomposition Loop

```
Coordinator session (workflow node: plan)
  1. Load issue + IssueMemory + Project knowledge
  2. LLM call with decomposer prompt:
     "Given this Complex issue, decompose into 2-5 disjoint sub-tasks.
      Each sub-task must have non-overlapping file scope."
  3. Parse output: [{role, title, description, scope_hints}, ...]
  4. For each sub-task:
     - Create child Issue (parent_id = current issue, type=task)
     - Enqueue TaskQueue item with workflow=simple-fix-flow + scope
  5. Emit Event(plan_complete, payload={sub_tasks: [...]})
  6. Suspend coordinator session via LangGraph interrupt; resume on aggregate node
  
Aggregate node:
  - Wait for all child issues to reach status=resolved OR timeout
  - On all done: dispatch Integrator
  - On any fail: classify + decide retry/replan/escalate
```

### Web App Structure

```
web/                                          # Next.js 16 App Router
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (protected)/
│   │   │   ├── layout.tsx                    # sidebar nav
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── projects/page.tsx
│   │   │   └── projects/[slug]/
│   │   │       ├── page.tsx                  # project overview
│   │   │       ├── issues/page.tsx           # list (filters)
│   │   │       ├── issues/[number]/page.tsx  # detail + stream
│   │   │       ├── queue/page.tsx
│   │   │       └── leases/page.tsx
│   │   └── api/auth/[...nextauth].route.ts   # (Phase 7+ if real auth)
│   ├── components/
│   │   ├── issue-list-table.tsx
│   │   ├── issue-detail.tsx
│   │   ├── agent-stream-viewer.tsx
│   │   ├── chat-message.tsx
│   │   ├── decomposition-tree.tsx            # show parent → children
│   │   ├── queue-view.tsx
│   │   ├── lease-viz.tsx                     # active leases by file glob
│   │   └── ui/                               # shadcn primitives
│   ├── lib/
│   │   ├── api-client.ts                     # REST wrapper (axios)
│   │   ├── ws.ts                             # WebSocket client + reconnect
│   │   └── queries.ts                        # React Query hooks
│   └── styles/globals.css
```

---

## Related Code Files

### Modify

| File | Change |
|---|---|
| `bumblebee/seeds/seed_default.py` | Update Coordinator prompt to real decomposition pattern |
| `bumblebee/services/execution/harness.py` | AgentDefinition lookup for prompt + tools + budgets |
| `bumblebee/routers/workflow_runs.py` | Handle Complex workflow (feature-complex-flow) decomposition |
| `bumblebee/workflows/feature-complex-flow.yaml` | Already exists; verify node connectivity |
| `bumblebee/main.py` | Add WebSocket endpoint registration |
| `bumblebee/cli.py` | (No change here; web is separate `cd web && npm run dev`) |

### Create

| File | Purpose |
|---|---|
| `bumblebee/services/control/coordinator.py` | Decomposition + dispatch + aggregation logic |
| `bumblebee/services/control/integrator.py` | Branch merge logic; conflict escalation |
| `bumblebee/services/websocket/__init__.py` | WS module |
| `bumblebee/services/websocket/manager.py` | WS connection manager + broadcast |
| `bumblebee/routers/websocket.py` | `/ws?project={slug}` route |
| `web/` (entire directory tree) | Next.js 16 app |
| `web/src/app/(protected)/projects/[slug]/issues/[number]/page.tsx` | Issue detail with stream |
| `web/src/components/agent-stream-viewer.tsx` | Live event stream |
| `web/src/components/decomposition-tree.tsx` | Parent-child issue tree |
| `web/src/components/lease-viz.tsx` | Active scope leases |
| `tests/test_coordinator.py` | Decomposition tests (mock LLM) |
| `tests/test_integrator.py` | Branch merge tests |
| `tests/test_websocket.py` | WS connection + broadcast |
| `docs/web-architecture.md` | Web app overview |
| `docs/scenario-c-walkthrough.md` | Full demo guide |

### Delete

- (none)

---

## Implementation Steps

### Week 1 — Coordinator + Integrator

1. **Day 1-2: Coordinator decomposition**
   - `services/control/coordinator.py::decompose(issue) -> list[SubTask]`
   - Prompt template: "Decompose into disjoint sub-tasks, each with file globs"
   - Parse LLM JSON output; create child Issue rows
   - Enqueue each sub-task

2. **Day 3: Coordinator aggregate**
   - LangGraph node `aggregate` waits for all child issues to be `status=resolved`
   - Listen via PG `LISTEN/NOTIFY` on `issues` table; or poll
   - On all done: emit Event(subtask_aggregate_complete) + transition to integrate node

3. **Day 4: Integrator**
   - `services/control/integrator.py::integrate(parent_issue)`:
     - Collect child issue worktree branches
     - Create integration branch from base
     - `git merge` each child branch
     - On merge conflict: escalate to coordinator (or request_human_approval)
   - Test: 3 disjoint sub-task branches → clean merge

4. **Day 5: Multi-specialist parallel dispatch**
   - Verify `asyncio.gather` of 4 worker dequeues works (PG SKIP LOCKED handles it)
   - tests/test_scenario_c.py: full Complex flow

### Week 2 — Web MVP

6. **Day 6-7: Next.js scaffold + API client + auth**
   - `npx create-next-app@latest web --typescript --tailwind --app`
   - Install: shadcn/ui, react-query, axios, lucide-react
   - API client: typed REST wrapper
   - Simple API-key auth: localStorage + header injection

7. **Day 8: Dashboard + Project pages**
   - `/dashboard`: list projects, recent activity from event log
   - `/projects/[slug]`: stats (open issues, in-progress, daily cost)

8. **Day 9-10: Issue list + detail**
   - `/projects/[slug]/issues`: table with filters (status, priority, type) — TanStack Table
   - `/projects/[slug]/issues/[number]`: tabs — Overview / Stream / Decomposition / Activity
   - Decomposition tab shows parent-child tree (recursive component)

### Week 3 — Stream viewer + queue + lease viz

11. **Day 11: WebSocket backend**
    - `services/websocket/manager.py`: connection registry, broadcast helper
    - `routers/websocket.py`: `/ws?project={slug}` accepts conn, subscribes to project events
    - Wire event emitters in event_log.append_event to also broadcast

12. **Day 12: Agent stream viewer**
    - `web/src/lib/ws.ts`: useEffect-based WS hook with auto-reconnect
    - `agent-stream-viewer.tsx`: groups events into chat-like messages
    - Display tool calls collapsed; expand on click

13. **Day 13: Queue view + lease viz**
    - `/projects/[slug]/queue`: list pending/running/dead-letter tasks
    - `/projects/[slug]/leases`: active leases with patterns + holder session

14. **Day 14: Scenario C end-to-end**
    - Run feature-complex-flow on a real Complex issue (test fixture)
    - Verify web UI shows: triage → plan → 4 parallel → integrate → review → done
    - Lease viz updates live

15. **Day 15: Polish + acceptance**
    - Empty states, loading states, error states
    - Mobile-responsive minimum (tablet+)
    - Commit: `feat(phase-4): web MVP + Coordinator + multi-specialist`

---

## Todo List

- [ ] Coordinator decompose function
- [ ] Coordinator aggregate node (LangGraph wait)
- [ ] Integrator branch merge
- [ ] tests/test_coordinator + test_integrator
- [ ] tests/test_scenario_c full E2E
- [ ] WebSocket manager + broadcast wiring
- [ ] WebSocket /ws route
- [ ] tests/test_websocket
- [ ] Next.js scaffold + Tailwind + shadcn
- [ ] API client + WS hook
- [ ] Dashboard + project pages
- [ ] Issue list with filters
- [ ] Issue detail with tabs
- [ ] Decomposition tree component
- [ ] Agent stream viewer (collapsible tool calls)
- [ ] Queue view
- [ ] Lease visualizer
- [ ] Mobile responsive
- [ ] Scenario C demo run
- [ ] Phase 4 commit

---

## Success Criteria

| Criterion | Verification |
|---|---|
| 1 Complex issue → 4 parallel sub-tasks → integrate | tests/test_scenario_c |
| Coordinator decomposition produces disjoint scopes | scope intersection check in test |
| Web shows live stream within 1s | manual timing test |
| Mobile/tablet renders correctly | Chrome DevTools responsive mode |
| Issue list filters work | manual UI test |
| WS auto-reconnects on disconnect | kill server briefly, verify recovery |
| Lease viz updates on acquire/release | manual demo |

---

## Risk Assessment

| Risk | P | I | Mitigation |
|---|---|---|---|
| Coordinator decomposition produces overlapping scopes | H | H | Post-decompose: validate disjoint; if overlap, re-prompt or human gate |
| LangGraph wait pattern unclear | M | M | Spike day 3; fallback: poll DB every 5s |
| Integrator merge conflicts cascade | M | H | Conflict → coordinator re-plan (sub-task reassign with reduced scope) |
| Web bundle bloats | M | L | Tree-shake; lazy load heavy components |
| WS connection scaling | L | M | Single-tenant v3.0; <50 concurrent expected |
| Next.js 16 stability | L | M | Pin to current stable; document upgrade gate |

---

## Security Considerations

- **Web API key in localStorage**: vulnerable to XSS; OK for v3.0 single-tenant; upgrade to httpOnly cookie Phase 7+
- **WS auth**: token in query string OR first message; validate before subscribing
- **Coordinator-LLM injection**: decomposition prompt receives Issue.description (user input); Defense Baseline applies; output is parsed strictly (refuse if not valid JSON)
- **Integrator git merge**: runs in workspace; verify worktree path is within `WORKSPACE_ROOT` (no escape)
- **CORS**: Phase 4 lock to same origin; tighten in Phase 7

---

## Next Steps

**Unblocks:**
- Phase 5 (Failure taxonomy actuator) — multi-specialist failures need routing
- Phase 6 (Knowledge memory) — Coordinator queries Project Knowledge during decomposition
- Phase 7 (ChatSession + Replay UI) — needs same web foundation

**Depends on:**
- Phase 1 (real harness) — Coordinator needs real LLM
- Phase 3 (ScopeLease + PluginLoader) — multi-specialist needs lease

---

## Unresolved Questions

1. **Coordinator wait mechanism**: PG LISTEN/NOTIFY vs poll vs LangGraph interrupt + resume. Day 3 decision.
2. **Integrator: rebase vs merge**: rebase keeps linear history but rewrites; merge keeps original SHAs. Default: merge (preserves event log integrity).
3. **Web status grouping**: 12+ statuses cognitively heavy. Group: Discovery / Planning / Execution / Verification / Shipped. Phase 4 design call.
4. **Decomposition prompt template stability**: critical for reliable disjoint scopes. Eval coverage in golden set (Phase 6).
5. **WS message buffering on slow client**: drop oldest? backpressure? Phase 4 day 11.
