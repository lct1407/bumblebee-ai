---
name: Bumblebee 2.0 — Workflow-as-Data Architecture Redesign
status: pending
created: 2026-04-27
phases: 7
estimated_effort: 9 weeks @ 1 dev FT (parallelizable across 3 tracks)
blockedBy: []
blocks: []
supersedes:
  - 260405-1159-bb-multi-device-hybrid-executor
  - 260415-0858-work-item-attachments
---

# Bumblebee 2.0 — Architecture Redesign

> **Pivot:** Hardcoded pipeline → workflow-as-data. Drag-drop builder. Lead+specialist agent A2A. Branch/PR linked. Web ↔ CLI parity.

## Source

Brainstorm summary: [`plans/reports/brainstorm-260427-1006-bumblebee-2-architecture.md`](../reports/brainstorm-260427-1006-bumblebee-2-architecture.md)

## Goals

1. **Workflow as data** — user defines pipelines via YAML or React Flow drag-drop; engine executes
2. **7-status lifecycle** — `open → planned → in_progress → in_review → done` (+ `blocked`, `cancelled`); detail trong `workflow_runs.current_node_ids`
3. **Lead + specialist agents** — Coder, Researcher, Reviewer, Writer with A2A messages
4. **Branch + PR tracking** — first-class fields on `work_items`, GitHub webhook sync
5. **3 modes** — Auto (Simple), Explicit (Lead orchestrates Complex), Manual (user triggers)
6. **CLI ↔ Web parity** — every action available both sides
7. **Test rigor** — P6 DoD checklist + CI regression suite to prevent "done but broken"

## Out of Scope (defer v2.1+)

- Code Review Graph (CRG) MCP integration
- External MCP server attachment per project
- Mobile app
- Multi-tenant SaaS

## Phases

| # | Phase | Track | Effort | Status | Parallel-able |
|---|-------|-------|--------|--------|---------------|
| P0 | [Reset](phase-00-reset.md) | — | 3d | pending | No (foundation) |
| P1 | [Core data layer](phase-01-core-data.md) | — | 1w | pending | No (foundation) |
| P2 | [Workflow engine](phase-02-workflow-engine.md) | A | 2w | pending | After P1 |
| P3 | [Agent layer + worker](phase-03-agent-layer.md) | A | 1.5w | pending | After P2 |
| P4 | [Web UI redesign](phase-04-web-ui.md) | B | 2.5w | pending | Parallel A (after P1) |
| P5 | [CLI parity](phase-05-cli.md) | C | 1w | pending | Parallel B (after P1) |
| P6 | [Test + polish](phase-06-test-polish.md) | — | 1w | pending | After A+B+C |

**Track parallelization:**
```
P0 → P1 ─┬─ Track A: P2 → P3 ──┐
         ├─ Track B: P4 ───────┼── P6
         └─ Track C: P5 ───────┘
```

**File ownership boundaries (parallel safety):**
- Track A: `api/src/workflow/`, `api/src/agents/`, `api/alembic/`
- Track B: `web/src/`
- Track C: `cli-ts/src/`

## Stack (final)

| Layer | Tech | Action |
|-------|------|--------|
| Backend | FastAPI Python | Keep, refactor |
| DB | PostgreSQL + Alembic | Wipe + reset |
| Engine | Custom asyncio (~600 LOC) | New |
| CLI | `cli-ts` | Keep, drop `cli/` Python |
| Worker | Tauri daemon | Keep main, drop Python daemon |
| Web | Next.js 16 + React Flow v12 | Refactor + new builder |

## Validation Milestones

- **End P1:** Postman CRUD pass — schema correct
- **End P3:** `bb workflow run sample.yaml` end-to-end với real Claude — engine works
- **End P4:** User vẽ workflow trên web → save → run → live viewer — UI works
- **End P5:** CLI parity 100% với web
- **End P6:** Full E2E suite pass + 4 templates demo OK — production-ready

## Definition of Done (P6)

- [ ] All 4 workflow templates pass end-to-end với real Claude API
- [ ] Web flow: login → create → board → run → done — zero bugs
- [ ] CLI parity: every web action có CLI command
- [ ] Migration: `scripts/import-legacy.py` map v0.13 → v2.0 OK
- [ ] Docs: `docs/workflows.md` + `docs/getting-started.md` rewritten
- [ ] Performance: 50 concurrent items, p95 dequeue < 500ms
- [ ] Coverage: backend ≥70%, frontend ≥60%, cli ≥70%
- [ ] Zero TODO/FIXME/HACK markers in new code
- [ ] CI regression suite (12 cases: 4 templates × 3 modes) green

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Workflow engine reinvent wheel | M | 8 nodes MVP, boolean expressions only |
| React Flow learning curve | M | 1 dev focus 1w, CLI YAML fallback |
| Wipe DB | L | JSON archive + rollback script |
| Token cost blowup | M | Per-project budget cap |
| Infinite loop config | H | `max_loops` per edge + global cap 50 |
| Parallel track conflicts | M | Strict file ownership boundaries |
| "Done but broken" | H | P6 DoD checklist + CI regression |

## Success Metrics

- New workflow from template ≤ 2 min create + run
- 12 regression cases pass 100% in CI
- Avg Lead+Coder+Reviewer ≤ 80k tokens
- 100% CLI ↔ Web parity
