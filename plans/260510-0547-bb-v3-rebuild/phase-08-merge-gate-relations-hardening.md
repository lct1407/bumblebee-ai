# Phase 08 — Human Merge Gate + Relation Detection + Production Hardening

## Context Links
- [plan.md](plan.md)
- [phase-06-worktree-parallel-sessions.md](phase-06-worktree-parallel-sessions.md)
- [phase-07-knowledge-distiller-wiki.md](phase-07-knowledge-distiller-wiki.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Week:** 8
- **Brief:** Final phase. Adds review/merge UI gating done transition, LLM-based task relation detection job, deploy guide, smoke tests, observability.

## Key Insights
- Human gate goes between `review` and `done` — this is where the developer ships consequences.
- Relation detection should be batch + cheap (Gemini Flash) — runs as cron, not synchronous.
- Hardening = observability (metrics + structured logs), graceful shutdown, deploy automation, smoke tests as gates.

## Requirements

### Functional
- Review/merge UI on task detail when status=review:
  - Diff viewer (server-side `git diff` between worktree branch and base).
  - Approve & Merge button → squash-merges worktree branch into `release/dev`, sets task=done, prunes worktree.
  - Request Changes button → posts comment, status back to running.
- API endpoints:
  - `GET /tasks/:id/diff` — unified diff text + per-file stats
  - `POST /tasks/:id/merge` — squash merge, body `{message}`
  - `POST /tasks/:id/request-changes` — body `{feedback}`
- Relation detection job:
  - Cron every 5min.
  - Selects tasks in `draft|clarifying|planned` updated in last 24h.
  - For each, asks Gemini: "Are any of these existing tasks related?" with last 50 task titles+descriptions.
  - Inserts `task_relations` rows with `confidence`, `kind` (duplicate, blocks, related).
- Web shows "Possibly related" panel on task detail (only relations confidence ≥0.6).
- Observability:
  - Prometheus metrics on `:9090/metrics`: `bb_runs_active`, `bb_runs_total{phase,outcome}`, `bb_run_duration_seconds`, `bb_token_usage_total{provider}`.
  - Structured logs (slog JSON) with `task_id`, `run_id`, `phase` keys.
  - Health endpoints: `/healthz` (deep — DB + workers), `/livez` (process up).
- Deploy:
  - `Dockerfile` (distroless, multi-stage).
  - `docker-compose.yml` for self-host (api, postgres, web, minio).
  - `.github/workflows/deploy-staging.yml` — build, push image, deploy via SSH or Coolify webhook.
  - `docs/deploy.md` — step-by-step.
- Smoke tests (Go test or Bash) hit a running staging:
  - login → create project → create task → run clarify → answer → run plan → approve → run implement → review → merge → wiki entry exists.

### Non-Functional
- Graceful shutdown: SIGTERM stops accepting new runs, waits ≤5min for active to finish, then SIGKILL.
- All HTTP responses include `request_id` header.
- 99% of `/tasks` API responses <300ms with 1k tasks.

## Architecture

```
Task review state
        │
        ▼
Web /tasks/[id] shows MergePanel
        │
   user clicks Approve & Merge
        │
        ▼
POST /tasks/:id/merge
        │
        ▼
MergeService
   - resolves worktree branch
   - acquires repo lock
   - git checkout release/dev
   - git pull
   - git merge --squash task/...
   - git commit -m "feat: ... (#NN)"
   - git push origin release/dev
   - WorktreeManager.Release(prune)
   - tasks.status = done (transition trigger fires distill via Phase 07 hook)
        │
        ▼
On error: status=failed, post comment, keep worktree

────────────────────────────────────────

RelationDetectionJob (cron 5m)
        │
        ▼
Select candidate tasks
        │
        ▼
GeminiVertexRunner (batch prompt)
        │
        ▼
INSERT task_relations
```

## Related Code Files (to create)

```
internal/api/diff/handler.go            — GET /tasks/:id/diff
internal/api/merge/handler.go           — POST /tasks/:id/merge
internal/api/merge/service.go           — git operations
internal/relations/detector.go          — Gemini batch caller
internal/relations/job.go               — cron loop
internal/api/relations/handler.go       — GET /tasks/:id/relations
migrations/0006_relations.up.sql        — task_relations table
internal/observability/metrics.go       — prom collectors
internal/observability/logging.go       — slog JSON setup
internal/api/health/deep.go             — DB + worker check
internal/server/shutdown.go             — graceful shutdown coordinator
Dockerfile
docker-compose.yml
.github/workflows/deploy-staging.yml
docs/deploy.md
docs/smoke-tests.md
scripts/smoke-test.sh
internal/server/smoke_test.go            — Go integration test against staging URL

# Web
web/components/tasks/merge-panel.tsx
web/components/tasks/diff-viewer.tsx
web/components/tasks/related-tasks-panel.tsx
web/components/tasks/request-changes-dialog.tsx
```

### Migration (0006_relations.up.sql)

```sql
CREATE TABLE task_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'duplicate','blocks','related'
  confidence REAL NOT NULL,
  detected_by TEXT NOT NULL,    -- 'llm','manual'
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_task_id, target_task_id, kind)
);
CREATE INDEX idx_relations_source ON task_relations(source_task_id);
```

## Implementation Steps

1. Migration 0006.
2. Implement `internal/api/diff/handler.go` — `git diff base..branch` in worktree, parse to JSON.
3. Implement `internal/api/merge/service.go`:
   - acquire repo mutex
   - update base branch
   - squash merge with auto-generated message (uses task title + number)
   - push
   - prune worktree
   - update task status (review→done)
4. Implement `request-changes` handler — post comment + status back to running (re-acquire worktree).
5. Implement `internal/relations/detector.go` — builds Gemini prompt with N candidate task summaries, parses JSON.
6. Implement `internal/relations/job.go` — cron via `time.Tick`, selects candidates, calls detector, inserts rows.
7. Implement `/tasks/:id/relations` endpoint.
8. Add Prometheus metrics:
   - middleware records request duration
   - executor records run counts/duration
   - runner records token usage (parsed from CLI output / API response)
9. Set up slog JSON handler with correlation IDs.
10. Implement `/healthz` deep check (DB ping, worker capacity, fs writable).
11. Implement graceful shutdown — drain semaphore, close DB pool, exit.
12. Web: `merge-panel.tsx` shown on review state, embeds `diff-viewer.tsx`.
13. Web: `request-changes-dialog.tsx` — feedback form.
14. Web: `related-tasks-panel.tsx` — fetches relations for current task.
15. Dockerfile (distroless), docker-compose with all services.
16. GitHub Actions workflow: build → push → deploy to staging.
17. `scripts/smoke-test.sh` and `internal/server/smoke_test.go`.
18. `docs/deploy.md` step-by-step.
19. Run full end-to-end smoke against staging — must pass before tagging v3.0.

## Todo List
- [ ] Relations migration
- [ ] Diff handler
- [ ] Merge service + handler
- [ ] Request-changes handler
- [ ] Relation detector + cron job
- [ ] Relations API endpoint
- [ ] Prom metrics
- [ ] Slog JSON
- [ ] Deep healthz
- [ ] Graceful shutdown
- [ ] Web merge panel + diff viewer
- [ ] Web related tasks panel
- [ ] Dockerfile + compose
- [ ] CI deploy workflow
- [ ] Smoke test script
- [ ] Smoke test Go
- [ ] Deploy guide
- [ ] Tag v3.0.0

## Success Criteria
- Reviewer can see diff, approve, and merge from UI.
- After merge: branch on release/dev, task=done, distill runs (Phase 07), wiki entry created.
- Relation detection populates "Possibly related" within 10min of new task creation.
- Prom metrics scrapable; Grafana dashboard renders run counts.
- Smoke test passes end-to-end against staging.
- Tag `v3.0.0` cut.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Merge conflicts on release/dev | H | M | UI surfaces conflict; user resolves manually in worktree |
| Relation detection false positives | H | L | confidence threshold 0.6 in UI; user dismiss button |
| Git push auth fails in container | M | H | document SSH key / token mounting; smoke test catches |
| Prom metrics cardinality blow-up | L | M | review labels — only `phase`, `outcome`, `provider`; no task_id labels |
| Graceful shutdown drops in-flight | M | M | persist run state; on restart mark in-flight as failed (not lost) |
| Deploy regression bypassed | L | H | smoke test as required CI gate; block deploy on fail |

## Security Considerations
- Merge endpoint requires `tasks.merge` permission (future RBAC; for now `owner` only).
- Diff output sanitized (no binary file contents, redact common secret patterns).
- Metrics endpoint protected by basic auth in production.
- Container runs non-root; readonly rootfs except `/tmp` and worktree volume.
- Image scanned in CI (trivy).

## Rollback
- Bad release: redeploy previous image tag from registry.
- Failed merge: `git reset --hard` on release/dev (manual, documented).
- Disable relation job: env `BB_RELATIONS_DISABLED=1`.

## Next Steps / Dependencies
- v3.1: Embeddings + pgvector for relation detection if accuracy demands.
- v3.2: Desktop daemon (Tauri) if parallel sessions exceed 3 per developer.
- v3.3: RBAC + multi-tenant.
