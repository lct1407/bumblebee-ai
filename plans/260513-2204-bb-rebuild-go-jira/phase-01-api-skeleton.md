# Phase 01 — API Skeleton (W1: 2026-05-21 → 05-27)

> **Goal:** Go API with chi+sqlc+pgx, JWT auth, users table migrated from v2, OpenAPI doc auto-generated.

## Context links
- [plan.md](plan.md) §2.1 Stack, §2.2 Decisions
- [Phase 00 — Bootstrap](phase-00-bootstrap.md) (prereq)
- Research: `../reports/researcher-260513-2211-bb-pipeline-orchestrator.md` (auth + users patterns)

## Overview
- **Priority:** P0
- **Status:** pending
- **Effort:** 7 days
- **Depends on:** Phase 00 complete

## Key insights from research
- v2 has dual auth (JWT + X-BB-API-Key) — v3 drops API key, JWT only (audit pain point #9)
- `users` table is only data migrated from v2 (bcrypt hashes compatible)
- v2 had no DB-level enforcement — v3 enforces every constraint at Postgres

## Requirements

### Functional
1. `users` table created with schema matching v2 (id UUID, email, password_hash, name, role, created_at)
2. Migration script copies v2 users → v3 staging (one-off, idempotent)
3. `POST /api/auth/register` — email/password signup (bcrypt cost 12)
4. `POST /api/auth/login` — returns JWT (RS256, 7-day exp)
5. `POST /api/auth/refresh` — refresh token rotation
6. `GET /api/me` — returns current user from JWT
7. JWT middleware on `/api/*` (except `/api/auth/*`)
8. OpenAPI 3.1 spec auto-generated from chi routes (via `swaggo/swag` or `oapi-codegen`)
9. `/docs` serves Swagger UI in non-prod

### Non-functional
- `/healthz` includes DB ping; fails if DB unreachable
- JWT validation: <1ms per request (no DB hit, signature only)
- Bcrypt verify: <500ms (cost 12 trade-off)
- All endpoints return RFC 7807 Problem Details on error

## Architecture

```
HTTP request
   │
   ▼
chi router
   │
   ├─ middleware.Recoverer
   ├─ middleware.RequestID
   ├─ middleware.RealIP
   ├─ slogchi (structured logging)
   ├─ CORS (configured per env)
   └─ JWT verifier (skip /auth/* and /healthz)
   │
   ▼
Handler
   │
   ▼
Service layer (business logic)
   │
   ▼
Repository (sqlc-generated)
   │
   ▼
pgx pool
   │
   ▼
Postgres
```

## Tech choices

| Concern | Library | Why |
|---|---|---|
| Router | `github.com/go-chi/chi/v5` | Stable, idiomatic |
| JWT | `github.com/golang-jwt/jwt/v5` | Maintained fork |
| Bcrypt | `golang.org/x/crypto/bcrypt` | stdlib-adjacent |
| Validation | `github.com/go-playground/validator/v10` | Tag-based |
| Config | `github.com/kelseyhightower/envconfig` | 12-factor |
| Migrations | `github.com/golang-migrate/migrate/v4` | Versioned |
| Codegen | `github.com/sqlc-dev/sqlc` | SQL-first |
| Logger | stdlib `log/slog` + `samber/slog-chi` | Structured |
| OpenAPI | `github.com/swaggo/swag` or `oapi-codegen` (pick day 1) | Auto-gen |
| Test | `testify` + `testcontainers-go` | Real Postgres in CI |

## Data model

```sql
-- migrations/000001_init_users.up.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('admin', 'member', 'viewer');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    avatar_url    TEXT,
    role          user_role NOT NULL DEFAULT 'member',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_email_active ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
```

## API surface (Phase 01)

| Method | Route | Handler | Notes |
|---|---|---|---|
| GET | `/healthz` | health | DB ping included |
| GET | `/readyz` | ready | for k8s/Coolify |
| POST | `/api/auth/register` | authRegister | email+password+name |
| POST | `/api/auth/login` | authLogin | returns access+refresh |
| POST | `/api/auth/refresh` | authRefresh | rotates refresh token |
| POST | `/api/auth/logout` | authLogout | revokes refresh |
| GET | `/api/me` | meGet | current user |
| PATCH | `/api/me` | meUpdate | name/avatar_url |
| POST | `/api/me/password` | mePasswordChange | requires current pw |

## Implementation steps

### Day 1 — DB foundation
1. Add `pgx/v5` pool initialization in `internal/db/pool.go`
2. Wire `golang-migrate` with embedded SQL files via `embed.FS`
3. Write migration `000001_init_users.up.sql` (+ `.down.sql`)
4. `make migrate-up` runs against staging DB
5. Verify with `psql`

### Day 2 — sqlc + users repository
1. `sqlc.yaml` config (target: `internal/db/queries`, codegen v2)
2. Write SQL queries in `internal/db/queries/users.sql` (CreateUser, GetUserByEmail, GetUserByID, UpdateUser, SoftDeleteUser)
3. `make generate` produces typed Go code
4. Write `internal/users/service.go` wrapping queries
5. Unit tests with testcontainers (real Postgres)

### Day 3 — Auth handlers
1. `internal/auth/jwt.go` — RS256 sign/verify (RSA key pair from env, generated once)
2. `internal/auth/handlers.go` — register, login, refresh, logout
3. `internal/auth/middleware.go` — chi middleware, extracts user_id from `Authorization: Bearer <jwt>`
4. Wire routes in `cmd/bb/serve.go`
5. Integration tests: register → login → call protected endpoint

### Day 4 — User migration script
1. `cmd/bb/migrate-users.go` — one-off CLI command
2. Reads from v2 Postgres (DSN via env), writes to v3 Postgres
3. Idempotent (upsert by email)
4. Logs count of inserted/updated/skipped
5. Run against staging once; verify counts match

### Day 5 — OpenAPI + Swagger UI
1. Add `swaggo/swag` annotations to handlers (or generate from chi route table)
2. `make generate` produces `docs/openapi.yaml`
3. Mount Swagger UI at `/docs` (only when `ENV != prod`)
4. Verify spec lints with `spectral lint`

### Day 6 — Error handling + logging
1. `internal/httperr/problem.go` — RFC 7807 Problem Details writer
2. All handlers return errors via problem detail
3. slog with JSON output, request_id correlation
4. Sentry stub (real wiring in Phase 09)

### Day 7 — Tests + CI green
1. Coverage target: 70% on `internal/auth` and `internal/users`
2. Integration test suite using testcontainers in CI (one Postgres per test run)
3. CI green; deploy to staging via dev branch push
4. Smoke test: register a real user on staging, login, hit `/api/me`

## Related files
- New: `internal/auth/*`, `internal/users/*`, `internal/db/*`, `migrations/000001_*`, `internal/httperr/*`, `cmd/bb/migrate-users.go`
- Modified: `cmd/bb/main.go` (add subcommands), `Makefile` (migrate + generate targets)
- Deleted: none

## Todo list
- [ ] DB pool initialized with health check
- [ ] Users table migration runs successfully on staging
- [ ] sqlc generates typed queries
- [ ] JWT RS256 keypair generated and stored in env (rotation plan documented)
- [ ] register/login/refresh/logout endpoints work
- [ ] JWT middleware blocks unauthenticated requests
- [ ] Migration script copies v2 users (idempotent)
- [ ] OpenAPI spec generated and lints
- [ ] Swagger UI accessible at `/docs` in staging
- [ ] All endpoints return RFC 7807 errors
- [ ] CI integration tests pass with testcontainers

## Success criteria (DoD)
- `curl -X POST staging.../api/auth/register` creates a user
- `curl -X POST .../api/auth/login` returns valid JWT
- `curl -H "Authorization: Bearer <jwt>" .../api/me` returns user JSON
- Staging deploy shows green health check after Phase 01 complete
- `make test` passes locally and in CI

## Risks
- **Risk:** bcrypt cost 12 too slow on shared DB host — measure on staging, drop to 10 if >500ms
- **Risk:** JWT key rotation not designed — document procedure even if not automated yet
- **Risk:** Users migration from v2 may have schema drift — add column-by-column verification step

## Security
- Passwords: bcrypt cost 12, never logged
- JWT: RS256 (asymmetric so public key can be shared with workers later), 7-day access + 30-day refresh
- Refresh token rotation: each refresh issues new token, old revoked
- Rate limiting (Phase 06): login endpoint capped 5/min/IP

## Next steps
→ [Phase 02 — Core Schema + CRUD](phase-02-core-schema-crud.md): projects, work_items, sprints, comments
