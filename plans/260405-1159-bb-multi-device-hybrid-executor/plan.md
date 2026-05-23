# Bumblebee Multi-Device + Hybrid Executor Upgrade

**Origin**: Synthesis of jarvis-agents Antigravity analysis + Bumblebee gap evaluation
**Branch**: master
**Estimated**: 3 sprints (~3 weeks @ 1 dev, or 1.5 weeks @ 2 devs)

## Goals

1. **Enable N devices per project without collisions** (critical — currently can race)
2. **Add remote executor for read-only phases** (triage/analyze/review) → scale batch workloads
3. **Keep write phases local** (implement/test/fix/deploy) — debug, DB, Docker, secrets required

## Non-Goals

- ❌ Full remote execution (test phase impossible: no DB/Docker/secrets on proxy)
- ❌ Replace Pinecone with Qdrant+LiteLLM (current stack sufficient)
- ❌ BM25/cross-encoder/knowledge-graph RAG (overkill at current scale)

## Sprints

| # | Sprint | Priority | File | Effort |
|---|---|---|---|---|
| 1 | [Multi-Device Safety](sprint-1-multi-device-safety.md) | MUST | — | 1 week |
| 2 | [Hybrid Executor](sprint-2-hybrid-executor.md) | SHOULD | — | 1 week |
| 3 | [Resilience + Polish](sprint-3-resilience-polish.md) | NICE | — | 6-7 days |

## Execution Order

```
Sprint 1 (blocking, do first)
  ├─ A1 Branch Allocator       — server-side unique branch names
  ├─ A2 Worktree Path Prefix   — per-device isolation
  ├─ A3 Execution Locks        — prevent dual-dispatch
  ├─ A4 Per-Device Rate Limits — prevent quota blowup
  └─ A5 Merge Coordinator      — serial git merge per repo
  
Sprint 2 (optional, enables batch triage/analyze)
  ├─ B1 Executor Interface     — abstraction for local|remote
  ├─ B2 Remote Proxy Executor  — Antigravity HTTP client
  ├─ B3 Affinity Routing       — project→runner sticky binding
  └─ B4 Phase Executor Config  — per-phase routing policy

Sprint 3 (UX + resilience)
  ├─ C1 Cost Per-Item + Budget Guard — rollup across phases, hard caps
  ├─ C2 Session Checkpoints    — resume after device crash
  ├─ C3 Quota Cache + Status Poll — 15-min poller + WS disconnect recovery
  ├─ C4 Git URL Helpers        — SSH→HTTPS coercion
  ├─ C5 RAG Contextual Prefix  — +35% retrieval accuracy
  ├─ C6 Rate Limit Countdown   — parse Claude headers, UI countdown, dispatch pause
  └─ C7 E2E Integration Tests  — 6 scenarios across full multi-device pipeline
```

## Critical Decisions Captured

| Decision | Choice | Reason |
|---|---|---|
| Test execution | **Always local** | Needs DB/Docker/env/debug |
| Remote proxy scope | **Read-only phases only** | triage/analyze/review |
| Branch naming | **Server-allocated** | `{type}/bb-{n}_{slug}_{device4}` |
| Merge ownership | **Server-side coordinator** | Single merge worker per repo |
| Quota limits | **Per-device + global** | 2-layer gate |
| RAG stack | **Keep Pinecone** | Integrated embedding sufficient |

## Success Criteria

- [ ] 3 devices run concurrently on same project, zero branch collisions
- [ ] Kill device mid-execute → work item auto-requeued, another device picks up
- [ ] Triage phase dispatched to remote proxy, response parsed correctly
- [ ] User can see per-device quota usage in dashboard
- [ ] WS disconnect → UI recovers via poll within 5s

## References

- `D:/Sources/bumblebee-cli/plans/260405-0853-antigravity-patterns-apply/` (predecessor, superseded)
- jarvis-agents source: `d:/Sources/jarvis-agents/forge/strapi/src/services/`
