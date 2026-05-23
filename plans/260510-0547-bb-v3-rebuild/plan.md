---
title: "Bumblebee v3 — From-Scratch Rebuild"
description: "Greenfield Go API + Next.js web rebuild with workflow-as-data, multi-runtime agents, and markdown skills."
status: pending
priority: P1
effort: 9w (1 bootstrap + 8 build)
owner: solo (ai006@grytt.co)
branch: master
tags: [rebuild, go, postgres, agents, workflow-as-data, multi-runtime]
created: 2026-05-10
---

# Bumblebee v3 — Rebuild Plan

Full rewrite. New repo `bumblebee`. Old repo archived as `bumblebee-legacy` at tag `v2-final`.
Stack: **Go** (chi + sqlc + pgx + golang-migrate) + **Postgres** + **Next.js 16** (shadcn + Tailwind v4 + React Query). Single Go binary serves API, CLI, MCP. Desktop daemon deferred to v3.2.

## Why rebuild
See `research/bb-v2-critical-audit.md` — 14+ statuses with legacy aliases, 4 packages with overlap, MCP is CRUD wrapper, knowledge base referenced but missing, no lifecycle enforcement, web UI over-engineered (21 routes, 104 components).

## Architectural decisions (locked)
- **Statuses (8 only, no aliases):** `draft → clarifying → planned → approved → running → review → done | failed`. Side: `wont_fix`, `blocked`, `needs_info`. Transitions enforced via DB CHECK.
- **Workflow-as-data:** YAML in `.bumblebee/workflows/`. Pipeline executor reads YAML, no if/else.
- **Skills-as-markdown:** `.bumblebee/skills/*.md` (frontmatter + prompt + few-shot). Edit = git commit. No DB.
- **Multi-runtime via `Runner` interface (2 adapters only):** ClaudeCLIRunner (subprocess) + GeminiVertexRunner (HTTP).
- **Knowledge wiki:** auto-generated markdown in `docs/knowledge/{topic}/` on task done. Filesystem RAG. No vector DB.
- **Relation detection:** Gemini Flash batch scan every 5min. No embeddings.
- **Migration:** only `users` table from v2. Everything else fresh.

## Dispatch matrix

| Phase | Runner | How |
|---|---|---|
| clarify | gemini-vertex | multimodal HTTP (gemini-2.5-flash) |
| plan / implement / test / review | claude-cli | subprocess, stream stdout |
| relation-detect / knowledge-distill | gemini-vertex | batch HTTP (gemini-2.5-flash) |

## Phases & calendar

| # | Week | Dates | Phase | Status | DoD |
|---|---|---|---|---|---|
| 00 | W0 | 2026-05-11 → 05-17 | Bootstrap (repo, CI, Coolify, secrets) | pending | Empty `bb` stub deploys to staging on push `dev` |
| 01 | W1 | 2026-05-18 → 05-24 | Go API skeleton + Postgres + auth | pending | `POST/GET /tasks`, JWT, sqlc, migrate up |
| 02 | W2 | 2026-05-25 → 05-31 | Workflow YAML executor + ClaudeCLIRunner | pending | YAML drives status auto-advance |
| 03 | W3 | 2026-06-01 → 06-07 | CLI + MCP server (same binary) | pending | `bb task ...` + 5 MCP tools |
| 04 | W4 | 2026-06-08 → 06-14 | Web UI MVP — 4 core routes | pending | List, detail+stream, wiki, settings |
| 05 | W5 | 2026-06-15 → 06-21 | Image upload + clarify + Gemini Vertex | pending | Bug screenshot → AI clarification |
| 06 | W6 | 2026-06-22 → 06-28 | Worktree manager + parallel sessions | pending | 3+ concurrent sessions, WS multiplex |
| 07 | W7 | 2026-06-29 → 07-05 | Knowledge distiller + wiki auto-gen | pending | Done task → markdown commit |
| 08 | W8 | 2026-07-06 → 07-12 | Merge gate + relation detection + hardening | pending | Review UI, relation job, deploy guide |
| — | W9 | 2026-07-13 → 07-19 | **Cutover** (dual-run + users migration + DNS flip) | pending | See `cutover-and-migration.md` |

Buffer: each phase has 1-day slack (Fri). W9 cutover doubles as overflow week.

## Dependencies
- 00 blocks all (repo + CI required)
- 02 blocks 03, 04, 05 (executor required)
- 03 blocks 06 (CLI triggers worktrees)
- 04 blocks 05, 07 (UI surface for upload + wiki)
- 05 blocks 06 (clarification precedes parallel runs)
- 07 blocks 08 (relation detection extends distiller pipeline)
- 08 blocks W9 cutover

## Success metrics (project-level)

| Metric | v2 | v3 target | Delta |
|---|---|---|---|
| Status enum size | 14 + aliases | 8, no aliases | -57% |
| Web routes | 21 | 4 | -81% |
| Web components | 104 | ≤25 | -76% |
| Top-level packages | 5 (api+cli+cli-ts+web+desktop) | 2 (bumblebee binary + web) | -60% |
| API binary size | n/a (Python) | <30MB single binary | — |
| Cold start | ~2s (Python) | <100ms (Go) | 20x |
| Bundle (web initial JS) | unmeasured | <250KB gzipped | budgeted |
| Time to first task event | unmeasured | <2s p95 | budgeted |

## Cost estimate (monthly, post-cutover)

| Item | Estimate | Notes |
|---|---|---|
| Gemini Vertex (Flash) | $5–15 | clarify + relation (288/day) + distill |
| Claude subscription | $0 incremental | existing Max plan |
| Postgres | $0 incremental | existing `db.sidcorp.co` |
| Coolify hosting | $0 incremental | 4 new resources on existing infra |
| **Total new** | **~$10–20/mo** | |

## Portfolio rollback
- During W0–W8: v2 prod untouched, abort = stop deploying to v3 staging.
- During W9 cutover: 7-day DNS flip-back window (see `cutover-and-migration.md` → Portfolio rollback).
- Post W9+7d: rollback impractical (v3 has divergent prod data); fix forward only.

## Phase files
- [Phase 00 — Bootstrap](phase-00-bootstrap.md)
- [Phase 01 — API Skeleton](phase-01-repo-api-skeleton.md)
- [Phase 02 — Workflow Executor](phase-02-workflow-executor-claude-cli.md)
- [Phase 03 — CLI + MCP](phase-03-cli-mcp-server.md)
- [Phase 04 — Web UI MVP](phase-04-web-ui-mvp.md)
- [Phase 05 — Image + Gemini](phase-05-image-upload-clarify-gemini.md)
- [Phase 06 — Worktrees](phase-06-worktree-parallel-sessions.md)
- [Phase 07 — Knowledge Wiki](phase-07-knowledge-distiller-wiki.md)
- [Phase 08 — Merge Gate + Relations](phase-08-merge-gate-relations-hardening.md)
- [Cutover & Migration (W9)](cutover-and-migration.md)

## Research
- [jarvis-agents architecture analysis](research/jarvis-agents-architecture-analysis.md)
- [BB v2 critical audit](research/bb-v2-critical-audit.md)

## Open questions
- Final GitHub org/repo name (`grytt/bumblebee`? `sidcorp/bumblebee`?)
- Cutover weekend confirmed for 2026-07-18/19?
- Keep v2 read-only beyond 90 days, or hard-delete 2026-10-18?
