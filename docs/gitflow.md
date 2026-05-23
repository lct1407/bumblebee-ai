# Gitflow & Test Gates

Standard branch flow with 4 quality gates between feature branch and production.

## Branch Model

| Branch | Purpose | Direct Push | Merge Source |
|--------|---------|-------------|--------------|
| `master` | Production | ❌ (PR + approval required) | `release/dev` only |
| `release/dev` | Staging integration | ⚠️ (allowed but discouraged) | feature branches via PR |
| `feat/bb-N_*` / `fix/bb-N_*` | Feature work | ✅ (own branch) | — |
| `worktree-agent-*` | Agent-isolated worktrees | ✅ (auto-created) | merged into feature branch |

## The 4 Gates

```
feat/bb-N ─┐
           │ Gate 1: Smoke test in worktree (lint + typecheck + unit)
           ▼
       PR to release/dev
           │ Gate 2: CI (.github/workflows/ci.yml)
           │   API Lint, API Test (Docker), Web Typecheck, Web Build, CLI Build
           ▼
       merge release/dev
           │ Gate 3: deploy-staging.yml
           │   Coolify staging deploy → wait 60s → curl staging health (5 retries)
           ▼
       PR release/dev → master
           │ Gate 2 again (CI on master PR)
           ▼
       squash merge master
           │ Gate 4: deploy.yml
           │   Coolify prod deploy → wait 90s → curl prod health (5 retries)
           ▼
       Production
```

## Gate 1 — Worktree Smoke Test (local, agent-driven)

Runs inside the agent worktree before the PR is opened. Triggered by `bb agent test <id>` or as a step in `bb agent run`.

- Lint (`ruff check`, `tsc --noEmit`)
- Unit tests for the changed package (api/cli/web)
- Fast — should fail in <2 min

**Gap:** currently runs against the shared production database (`db.sidcorp.co:15434`). Parallel agents can collide on schema-changing tests. See *Known Issues* below.

## Gate 2 — Pull Request CI

Defined in `.github/workflows/ci.yml`. Triggers on `pull_request` to `master` or `release/dev`.

| Job | Required | What it runs |
|-----|----------|-------------|
| API Lint | yes | `ruff check api/src/` |
| API Test | yes | Docker build of `Dockerfile.api-test` + run |
| Web Typecheck | yes | `tsc --noEmit` |
| Web Build | yes | `npm run build` |
| CLI (TypeScript) Build | yes | `npm run build` + `tsc --noEmit` |

To enforce as required checks: configure GitHub branch protection per `.github/BRANCH_PROTECTION.md`.

## Gate 3 — Staging Deploy + Smoke Test

Defined in `.github/workflows/deploy-staging.yml`. Triggers on `push: [release/dev]`.

1. Calls Coolify deploy API for the staging resource
2. Waits 60 s for containers to settle
3. Curls `STAGING_HEALTH_URL` up to 5 times (15 s between retries)
4. Fails the workflow if health check never returns 200

**Required secrets:**
- `COOLIFY_TOKEN` — Coolify API token (already set for prod)
- `COOLIFY_STAGING_UUID` — staging resource UUID
- `STAGING_HEALTH_URL` — e.g. `https://staging.musetools.com/api/health`

If either secret is missing the step warns and skips — does not block merge.

## Gate 4 — Production Deploy + Verify

Defined in `.github/workflows/deploy.yml`. Triggers on `push: [master]`.

Same shape as Gate 3 but against the production Coolify resource. Uses `PROD_HEALTH_URL` secret. 90 s settle, 20 s retry interval.

## Working as a Developer / Agent

1. Branch off `release/dev`: `git checkout -b feat/bb-N_short-desc release/dev`
2. Implement + commit
3. Run `bb agent test <id>` (Gate 1) — fix until green
4. Open PR targeting `release/dev` — wait for Gate 2 green
5. Squash merge — Gate 3 runs automatically, watch the workflow tab
6. When `release/dev` has accumulated enough verified changes, open PR `release/dev → master`
7. Merge → Gate 4 runs

## Known Issues / Followups

- **Worktree DB isolation** — multiple parallel agents share the prod DB. Mitigation candidates: per-worktree `.env` override, ephemeral schema per agent run, or a dedicated staging DB. Not addressed in this gitflow doc.
- **Port collisions** — worktrees on the same device inherit the same env, so any test binding to a fixed port (e.g. `localhost:3000`) will collide. Tests should bind to ephemeral ports.
- **`qa_test` phase unimplemented** — `pipeline_orchestrator.PIPELINE_SKILLS["testing"] = "qa_test"` exists but has no executor. Filling this in would give Gate 3 a real e2e suite instead of a single health-curl.
- **Branch protection enforcement** — `BRANCH_PROTECTION.md` documents the desired state; whether GitHub actually enforces it is a manual setting not visible in the repo.
