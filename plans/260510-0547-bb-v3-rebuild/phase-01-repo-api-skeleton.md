# Phase 01 — Repo + Go API Skeleton + Postgres + Auth

## Context Links
- [plan.md](plan.md)
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md) — pains 1, 2, 9, 10 addressed here
- [research/jarvis-agents-architecture-analysis.md](research/jarvis-agents-architecture-analysis.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Week:** 1
- **Brief:** Greenfield repo. Go API + Postgres schema + JWT auth + sqlc + golang-migrate. End state: `POST/GET /tasks` with status-transition enforcement.

## Key Insights
- DB enum + CHECK constraint kills the v2 status drift class entirely.
- Single binary (`bb`) will later host API + CLI + MCP — set up cmd/ tree from day 1.
- sqlc beats GORM for predictable queries; pgx beats database/sql for performance + types.
- Migration imports v2 `users` only — auth pass-through, nothing else.

## Requirements

### Functional
- New repo `bumblebee` (separate from `Bumblebee-cli`).
- Postgres schema: `users`, `projects`, `tasks`, `task_events`, `task_session_context`.
- Status enum 8 values: draft, clarifying, planned, approved, running, review, done, failed.
- Side states 3 values: wont_fix, blocked, needs_info.
- Status transition table enforced via Postgres trigger.
- JWT auth (HS256, 12h access + 30d refresh).
- Endpoints: `POST /auth/login`, `POST /auth/refresh`, `GET /me`, `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`.
- Migration script imports `users` from v2 Postgres dump.

### Non-Functional
- Go 1.23+
- All handlers <120 lines (split into service+handler).
- sqlc-generated query code, no hand-written SQL in handlers.
- Structured logging (slog).
- Config via env (no secrets in code).

## Architecture

```
cmd/bb/main.go
  │
  ├─ internal/api          (chi router, middleware)
  ├─ internal/auth         (JWT, password hash)
  ├─ internal/tasks        (handler + service)
  ├─ internal/db           (sqlc generated)
  ├─ internal/migrate      (golang-migrate runner)
  └─ internal/config       (env loader)

migrations/  (.sql files for golang-migrate)
queries/     (.sql files for sqlc)
```

Status FSM enforced in DB:
```
draft ──► clarifying ──► planned ──► approved ──► running ──► review ──┬─► done
                                                                       └─► failed
any active ──► wont_fix | blocked | needs_info
blocked | needs_info ──► (back to prior active state)
```

## Related Code Files (to create)

```
go.mod
go.sum
cmd/bb/main.go                              — entry, parses subcommand (api default)
cmd/bb/api.go                               — `bb api` runs HTTP server
internal/config/config.go                   — env loader (DB_URL, JWT_SECRET, PORT)
internal/db/schema.sql                      — reference, source of truth
internal/db/queries/tasks.sql               — sqlc queries
internal/db/queries/users.sql
internal/db/queries/auth.sql
internal/db/sqlc.yaml                       — sqlc config
internal/api/router.go                      — chi setup, middleware chain
internal/api/middleware/auth.go             — JWT bearer extraction
internal/api/middleware/logging.go
internal/api/middleware/recover.go
internal/auth/jwt.go                        — sign/verify
internal/auth/password.go                   — bcrypt
internal/auth/handler.go                    — login/refresh
internal/tasks/handler.go                   — HTTP layer
internal/tasks/service.go                   — business logic, transition validation client-side too
internal/tasks/dto.go                       — request/response shapes
internal/users/handler.go                   — /me
migrations/0001_init.up.sql                 — full schema below
migrations/0001_init.down.sql
migrations/0002_seed_dev.up.sql             — dev-only seed
scripts/migrate-users-from-v2.sh            — one-shot import
.env.example
README.md
Makefile                                    — make run / make migrate / make sqlc
```

### Postgres schema (migrations/0001_init.up.sql)

```sql
CREATE TYPE task_status AS ENUM (
  'draft','clarifying','planned','approved','running','review','done','failed',
  'wont_fix','blocked','needs_info'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  workflow_path TEXT NOT NULL DEFAULT '.bumblebee/workflows/default.yaml',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'draft',
  priority SMALLINT NOT NULL DEFAULT 2,
  assignee_id UUID REFERENCES users(id),
  parent_id UUID REFERENCES tasks(id),
  session_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, number)
);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);

CREATE TABLE task_events (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  kind TEXT NOT NULL,         -- 'status_change','comment','phase_start','phase_end'
  from_status task_status,
  to_status task_status,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_events_task ON task_events(task_id, created_at);

-- Transition matrix
CREATE TABLE task_status_transitions (
  from_status task_status NOT NULL,
  to_status   task_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO task_status_transitions VALUES
  ('draft','clarifying'),('draft','planned'),
  ('clarifying','planned'),('clarifying','needs_info'),
  ('planned','approved'),('planned','clarifying'),
  ('approved','running'),
  ('running','review'),('running','failed'),('running','blocked'),
  ('review','done'),('review','running'),('review','failed'),
  ('failed','running'),('failed','wont_fix'),
  ('blocked','running'),('blocked','wont_fix'),
  ('needs_info','clarifying'),('needs_info','wont_fix'),
  ('done','running'),  -- reopen
  ('wont_fix','draft');

CREATE OR REPLACE FUNCTION enforce_task_transition() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM task_status_transitions
    WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'invalid transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_transition
  BEFORE UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION enforce_task_transition();
```

## Implementation Steps

1. `git init bumblebee`, set up `.gitignore`, MIT `LICENSE`.
2. `go mod init github.com/<org>/bumblebee`.
3. Add deps: chi, pgx/v5, sqlc, golang-migrate, jwt/v5, bcrypt, godotenv, slog.
4. Write `migrations/0001_init.up.sql` per schema above + `.down.sql`.
5. Configure sqlc (`internal/db/sqlc.yaml`); write `tasks.sql` and `users.sql` queries.
6. `make sqlc` generates `internal/db/*.go`.
7. Implement `internal/config/config.go` — env loader.
8. Implement `internal/auth/{jwt,password,handler}.go`.
9. Implement `internal/api/router.go` with chi + middleware (logging, recover, auth).
10. Implement `internal/tasks/{service,handler,dto}.go` — CRUD + status update.
11. Wire `cmd/bb/api.go` — start server on `:$PORT`.
12. Write `scripts/migrate-users-from-v2.sh` — pg_dump v2 users → restore.
13. Write smoke test: `curl POST /auth/login`, `curl POST /tasks`, `curl PATCH /tasks/:id` (valid + invalid transition).
14. README quickstart.

## Todo List
- [ ] Repo created, go.mod initialized
- [ ] Dependencies pinned
- [ ] Migrations 0001 written + applied
- [ ] sqlc config + generated code
- [ ] Config loader
- [ ] Auth (JWT + bcrypt + login/refresh)
- [ ] Tasks CRUD handler+service
- [ ] Router + middleware
- [ ] Smoke test passes (valid + invalid transition)
- [ ] User migration script tested against v2 dump
- [ ] README quickstart verified on clean machine

## Success Criteria
- `make run` starts API on :8080.
- `curl -X POST /auth/login` returns JWT.
- `POST /tasks` with JWT creates task in `draft`.
- `PATCH /tasks/:id status=running` from `draft` returns 400 (invalid transition).
- `PATCH /tasks/:id status=clarifying` from `draft` returns 200.
- DB query confirms `task_events` row written for transition.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| sqlc + pgx v5 friction (driver name) | M | L | use `pgx/v5/stdlib` or sqlc pgx mode |
| Trigger blocks legitimate admin fixes | L | M | add SQL function `force_status(uuid, status, reason)` SECURITY DEFINER, audit-logged |
| User import collisions (duplicate emails) | L | M | dry-run mode in migrate script, conflict report |
| JWT secret rotation breaks sessions | L | L | document rotation in README, accept short outage |

## Security Considerations
- Bcrypt cost ≥ 12.
- JWT signed HS256; secret ≥ 32 bytes; rotate quarterly.
- All endpoints require auth except `/auth/login` and `/healthz`.
- SQL only via sqlc-generated functions — no string concat.
- Rate limit `/auth/login` (5/min/IP) via chi middleware.

## Rollback
- New repo — rollback = `git reset` or trash the directory. Old repo untouched.
- DB: `migrate down 1` reverts schema (no production data yet).

## Next Steps / Dependencies
- Phase 02 depends on schema + auth being live.
- Add `task_events` write hook in service layer (Phase 02 will subscribe).
