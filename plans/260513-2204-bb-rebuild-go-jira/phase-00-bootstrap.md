# Phase 00 — Bootstrap (W0: 2026-05-14 → 05-20)

> **Goal:** Empty `bb` Go binary + Next.js shell deployed to Coolify staging via CI on push to `dev` branch.

## Context links
- [plan.md](plan.md)
- Research: `../reports/researcher-260513-2210-*.md` (4 reports)

## Overview
- **Priority:** P0 (blocks all other phases)
- **Status:** pending
- **Effort:** 5 days

## Key insights from research
- Use single Go binary serving API + CLI + MCP (per BB v3 plan and jarvis multi-binary lessons)
- WS server uses gorilla/websocket; client uses native WebSocket API
- Coolify already in use; reuse existing infra (no new $)
- v2 prod stays untouched during W0-W8

## Requirements

### Functional
1. New GitHub repo `bumblebee` created
2. Single Go module `github.com/{org}/bumblebee` builds to `bin/bb`
3. `bb serve` boots HTTP on `:8080` with `/healthz` returning `{"ok": true, "version": "..."}`
4. `web/` Next.js 16 boots on `:3000` with placeholder login page
5. Postgres staging DB provisioned at `db.sidcorp.co` (new DB `bumblebee_staging`)
6. CI pipeline: lint + test + build + push Docker image to GHCR + Coolify webhook deploy on push to `dev`

### Non-functional
- Build time CI: <3 min cold, <60s warm
- Docker image: `bb` binary <30MB, `web` <100MB (multi-stage)
- Coolify deploy: <60s after image push

## Repository layout (final shape at end of W0)

```
bumblebee/
├── .github/
│   └── workflows/
│       ├── ci.yml             # lint + test + build
│       └── deploy-staging.yml # push to dev → Coolify webhook
├── cmd/
│   └── bb/
│       └── main.go            # entrypoint, cobra root cmd
├── internal/
│   ├── server/                # HTTP/WS server (Phase 01+)
│   ├── db/                    # pgx pool, sqlc generated (Phase 01+)
│   └── config/                # envconfig
├── migrations/                # golang-migrate SQL files (Phase 01+)
├── pkg/                       # exported utility code (kept minimal)
├── web/
│   ├── app/                   # Next.js 16 App Router
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── next.config.mjs
├── .bumblebee/                # workflow YAML + skills (Phase 07+)
├── docs/
│   ├── architecture.md
│   ├── getting-started.md
│   └── deployment.md
├── scripts/
│   ├── dev.sh                 # local dev orchestrator
│   └── psql.sh                # connect to staging DB
├── Dockerfile.bb              # Go multi-stage
├── Dockerfile.web             # Next.js standalone
├── docker-compose.yml         # local dev: postgres + bb + web
├── go.mod
├── go.sum
├── Makefile                   # build, test, lint, generate
├── .env.example
├── .gitignore
├── .golangci.yml
├── CLAUDE.md
└── README.md
```

## Architecture

```
GitHub repo `bumblebee`
       │
       │ push dev
       ▼
GitHub Actions CI
  ├─ lint (golangci-lint + eslint)
  ├─ test (go test + vitest)
  ├─ build (Go + Next.js)
  ├─ docker build × 2 (bb, web)
  └─ push to GHCR
       │
       │ webhook
       ▼
Coolify (staging.bumblebee.{domain})
  ├─ bb-api    :8080
  ├─ bb-web    :3000
  └─ postgres  (db.sidcorp.co existing)
```

## Implementation steps

### Day 1 — Repo + Go skeleton
1. Create GitHub repo `{org}/bumblebee` (private initially)
2. `go mod init github.com/{org}/bumblebee`
3. Add `cmd/bb/main.go` with cobra root + `serve` subcommand
4. Implement `/healthz` endpoint with chi router
5. Add `Dockerfile.bb` (multi-stage, distroless final, <30MB)
6. Test local: `go run ./cmd/bb serve` → `curl :8080/healthz`

### Day 2 — Next.js shell
1. `npx create-next-app@latest web --typescript --tailwind --app --eslint --turbopack`
2. Upgrade to Next.js 16, configure Tailwind v4, install shadcn/ui (`npx shadcn@latest init`)
3. Add `web/app/login/page.tsx` (placeholder, no logic)
4. Add `web/app/layout.tsx` with minimal Jira-like top nav skeleton
5. Add `Dockerfile.web` (standalone output, multi-stage)
6. Test local: `npm run dev` → `http://localhost:3000/login`

### Day 3 — Local dev orchestration
1. `docker-compose.yml`: postgres 16 + bb + web (with hot reload via mounted volumes)
2. `scripts/dev.sh`: `docker-compose up -d postgres` + `air` for Go hot reload + `npm run dev` for web
3. `.env.example` with all required vars
4. `Makefile` targets: `dev`, `build`, `test`, `lint`, `generate`, `migrate-up`, `migrate-down`
5. Document setup in `docs/getting-started.md`

### Day 4 — CI pipeline
1. `.github/workflows/ci.yml`:
   - `lint-go`: golangci-lint
   - `lint-web`: eslint
   - `test-go`: go test (no DB yet)
   - `test-web`: vitest (no tests yet, just config)
   - `build`: matrix(bb, web) → docker buildx → push to GHCR (only on push)
2. `.golangci.yml` with sane defaults (govet, errcheck, staticcheck, revive)
3. `.github/workflows/deploy-staging.yml`: on push to `dev`, ping Coolify webhook
4. Repo secrets: `GHCR_TOKEN`, `COOLIFY_WEBHOOK_STAGING`

### Day 5 — Coolify staging
1. Provision Postgres DB `bumblebee_staging` on `db.sidcorp.co`
2. Create Coolify resources: `bb-api-staging`, `bb-web-staging`
3. Configure env vars in Coolify dashboard (DB URL, JWT secret placeholder)
4. Set staging domain: `staging.bumblebee.{domain}` (TBD per open question #2 in plan.md)
5. First deploy: push to `dev` → confirm health check green
6. Document deploy flow in `docs/deployment.md`

## Related files
- New: all files in repo layout above
- Modified: none (greenfield)
- Deleted: none

## Todo list
- [ ] Decide GitHub org for new repo (plan.md open Q1)
- [ ] Decide production domain (plan.md open Q2)
- [ ] Create new repo `bumblebee` with branch protection on `master` + `dev`
- [ ] Tag current `Bumblebee-cli` as `bumblebee-legacy/v2-final` before any work
- [ ] Push Go skeleton with `/healthz`
- [ ] Push Next.js shell with `/login` placeholder
- [ ] Local dev via docker-compose working end-to-end
- [ ] CI green on first commit
- [ ] Coolify deploy of `dev` branch automated
- [ ] `docs/getting-started.md` + `docs/deployment.md` written

## Success criteria (DoD)
- Push to `dev` branch triggers CI → builds image → Coolify deploys → `https://staging.bumblebee.{domain}/healthz` returns 200 within 5 min total
- Local `make dev` brings up postgres + bb + web; logs visible; hot reload works
- No secrets in repo (verified by truffleHog or similar in CI)

## Risks
- **Risk:** Coolify webhook timing or quota — mitigation: manual fallback `coolify deploy` CLI documented
- **Risk:** GitHub Actions free-tier minutes (private repo) — mitigation: enable Actions only for `dev` + `master` branches initially
- **Risk:** Domain DNS propagation delay — mitigation: use temporary `*.sidcorp.co` subdomain during W0

## Security
- All secrets in repo secrets or Coolify env, never committed
- `.env.example` shows variable NAMES only, no values
- `gitleaks` job in CI to catch secret leaks pre-merge

## Next steps
→ [Phase 01 — API Skeleton](phase-01-api-skeleton.md): real auth, DB, sqlc, JWT
