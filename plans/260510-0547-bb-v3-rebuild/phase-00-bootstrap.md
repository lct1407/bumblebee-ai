# Phase 00 — Bootstrap (Repo + CI + Infra)

## Context Links
- [plan.md](plan.md)
- [cutover-and-migration.md](cutover-and-migration.md)
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md)

## Overview
- **Priority:** P0 (blocks every other phase)
- **Status:** pending
- **Week:** 0 (2026-05-11 → 2026-05-17)
- **Brief:** Greenfield repo `bumblebee` on GitHub, CI/CD pipeline, Coolify resources, secrets, branch protection, env templates. End state: empty `bb` binary builds and deploys on push to `dev`.

## Key Insights
- Bootstrap quality dictates 8-week velocity — pay the cost now, save weeks of yak-shaving.
- Mirror v2 Coolify topology (api / web) but use `-v3` suffix on resource names → parallel deploys throughout dev.
- Use GitHub Environments (`staging`, `production`) for secret scoping, not branch-based secrets.
- Single matrix in CI for Go + Node — keep the workflow file <100 lines.

## Requirements

### Functional
- GitHub repo `<org>/bumblebee` created, private, default branch `master`.
- `.github/workflows/ci.yml`: lint + test + build (Go) + lint + test + build (web). Triggers: PR + push to `dev`/`master`.
- `.github/workflows/deploy-staging.yml`: on push `dev` → SSH webhook to Coolify staging.
- `.github/workflows/deploy-prod.yml`: on push `master` → tag + Coolify prod webhook.
- Branch protection: `master` + `dev` require PR + 1 review + green CI.
- Coolify resources provisioned (idle, no code yet):
  - `bumblebee-api-v3-staging` (Go Dockerfile)
  - `bumblebee-api-v3-prod`
  - `bumblebee-web-v3-staging` (Next.js Dockerfile)
  - `bumblebee-web-v3-prod`
- Postgres: new database `bumblebee_v3` on existing `db.sidcorp.co:15434` (separate from `bumblebee` v2 DB).
- Secret scaffolding (GitHub Environments):
  - `staging`: `DATABASE_URL`, `JWT_SECRET`, `COOLIFY_WEBHOOK_URL`, `COOLIFY_API_TOKEN`, `GEMINI_VERTEX_KEY`, `GCP_PROJECT_ID`
  - `production`: same set
- `.env.example` at repo root listing all required env vars with comments.
- README.md skeleton (sections: Overview, Quickstart, Architecture, Contributing).
- LICENSE (copy from v2).
- Pre-commit: `gofmt`, `golangci-lint run`, `npm run lint --workspaces`.

### Non-Functional
- CI run <5 min on cold cache.
- Coolify deploy <3 min from push to live.
- Branch protection cannot be bypassed except by org admin (force flag must show in audit log).

## Architecture

```
GitHub (bumblebee repo)
  ├── .github/workflows/
  │   ├── ci.yml            ─ lint+test+build (PR + push)
  │   ├── deploy-staging.yml ─ push dev   → Coolify staging
  │   └── deploy-prod.yml    ─ push master → tag + Coolify prod
  ├── cmd/bb/main.go         ─ empty stub (prints version)
  ├── web/package.json       ─ next 16 stub
  ├── Dockerfile             ─ Go multi-stage
  ├── web/Dockerfile         ─ Next.js standalone
  ├── docker-compose.yml     ─ local dev (api + postgres)
  ├── .env.example
  ├── README.md
  └── LICENSE

Coolify (manage.sidcorp.co)
  ├── bumblebee-api-v3-staging   → staging.bb-v3.sidcorp.co/api
  ├── bumblebee-web-v3-staging   → staging.bb-v3.sidcorp.co
  ├── bumblebee-api-v3-prod      → bb-v3.sidcorp.co/api
  └── bumblebee-web-v3-prod      → bb-v3.sidcorp.co

Postgres (db.sidcorp.co:15434)
  └── database bumblebee_v3 (new, isolated from v2 DB)
```

## Related Code Files (to create)

```
README.md
LICENSE
.gitignore
.env.example
.editorconfig
.golangci.yml
go.mod
cmd/bb/main.go                  — `bb version` stub only
Dockerfile
docker-compose.yml
web/package.json                — minimal next 16 scaffold
web/Dockerfile
.github/workflows/ci.yml
.github/workflows/deploy-staging.yml
.github/workflows/deploy-prod.yml
.github/CODEOWNERS
.github/pull_request_template.md
docs/contributing.md
```

## Implementation Steps

1. Create GitHub repo `<org>/bumblebee` (private, no initial commit from UI).
2. Local: `git init bumblebee && cd bumblebee`.
3. Add `.gitignore` (Go + Node + IDE).
4. `go mod init github.com/<org>/bumblebee`.
5. `cmd/bb/main.go` — minimal: prints `bb v3.0.0-dev`.
6. `Dockerfile` — Go 1.23 alpine builder + scratch runtime.
7. `web/`: `npx create-next-app@16 . --ts --tailwind --app --no-install` (skip npm install, just scaffold).
8. `web/Dockerfile` — Node 20 → standalone output.
9. `docker-compose.yml` — postgres 16 + api (build local) for dev.
10. Write 3 workflow files (see snippets in Appendix below).
11. Push to GitHub, add branch protection rules via `gh api repos/<org>/bumblebee/branches/master/protection ...`.
12. Coolify UI: create 4 resources (api+web × staging+prod), point to repo, set webhooks.
13. Populate GitHub Environment secrets via `gh secret set --env staging ...` (one per var).
14. Run Postgres init: `psql -h db.sidcorp.co -p 15434 -U postgres -c "CREATE DATABASE bumblebee_v3;"`.
15. Trigger first dev deploy (push dummy commit to `dev` branch) — verify Coolify pulls + builds + serves.
16. Add CODEOWNERS (`* @<your-handle>`) + PR template.
17. Archive script for v2 repo: `git tag v2-final && git push origin v2-final` on `Bumblebee-cli` repo (deferred to cutover week, but write the script now).

## Todo List
- [ ] GitHub repo created + initial commit
- [ ] Go module + binary stub builds (`go build ./...`)
- [ ] Web scaffold builds (`cd web && npm run build`)
- [ ] Dockerfiles produce <50MB images
- [ ] docker-compose up runs locally (api + postgres)
- [ ] ci.yml passes on first push
- [ ] deploy-staging.yml triggers Coolify on push dev
- [ ] deploy-prod.yml triggers Coolify on push master
- [ ] Branch protection rules active (master + dev)
- [ ] 4 Coolify resources provisioned + idle
- [ ] Postgres `bumblebee_v3` DB exists
- [ ] Secrets populated for staging + production environments
- [ ] README + LICENSE + .env.example committed
- [ ] CODEOWNERS + PR template active
- [ ] v2 archive script written (run later)

## Success Criteria
- `git push origin dev` triggers CI → green → Coolify staging deploy → `https://staging.bb-v3.sidcorp.co` returns 200 from web stub.
- `gh secret list --env staging` shows all 6 secrets.
- `gh api repos/<org>/bumblebee/branches/master/protection` returns enforced rules.
- `psql -h db.sidcorp.co -p 15434 -d bumblebee_v3 -c '\dt'` connects (empty schema OK).
- Local: `docker compose up` brings api+postgres healthy in <30s.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Coolify webhook flaky | M | M | retry in workflow + manual deploy fallback documented |
| Secret leak in CI logs | L | H | use `gh secret set` (never echo), mask in workflow with `::add-mask::` |
| Branch protection blocks emergency hotfix | L | M | admin override path documented in CONTRIBUTING |
| Postgres v3 DB collides with v2 backups | L | H | distinct DB name `bumblebee_v3`, separate Coolify resource names with `-v3` |
| GitHub Actions minutes overrun | L | L | cache Go module + npm; matrix only on tags |

## Security Considerations
- All secrets in GitHub Environments (not repo secrets) — enables review gates.
- Coolify webhook URL treated as secret (rotate quarterly).
- `.env.example` MUST NOT contain real values (CI lint check).
- Pre-commit hook: `gitleaks` scan to block accidental key commits.

## Rollback
- Bootstrap is idempotent — destroy = delete GitHub repo + Coolify resources + drop DB. No production data yet.
- If CI broken: revert workflow PR. Coolify resources stay idle, no impact.

## Next Steps / Dependencies
- Unblocks Phase 01 (API skeleton): repo + CI exists, Phase 01 fills `cmd/bb/api.go` + Postgres schema.
- Coolify resources stay idle until Phase 01 ships first migration.

## Appendix — CI workflow snippet

```yaml
# .github/workflows/ci.yml (skeleton)
name: ci
on:
  pull_request:
  push:
    branches: [master, dev]
jobs:
  go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.23', cache: true }
      - run: go vet ./...
      - run: golangci-lint run
      - run: go test ./... -race
      - run: go build ./cmd/bb
  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: web/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```
