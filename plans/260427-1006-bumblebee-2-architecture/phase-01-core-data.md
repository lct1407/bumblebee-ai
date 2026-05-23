# Phase 1 — Core Data Layer

**Track:** Foundation (blocking) | **Effort:** 1 week | **Status:** pending | **Depends:** P0

## Context

Build clean schema (12 tables) + CRUD APIs + auth. Foundation for parallel tracks A/B/C.

## Requirements

- 12 SQLAlchemy models matching design doc
- Single Alembic migration (init schema)
- Pydantic v2 schemas (request/response DTOs)
- REST CRUD endpoints (project, work_item, comment, attachment, workflow, agent_definition, device, queue_item)
- JWT + X-BB-API-Key auth (port from current)
- WebSocket scaffolding (`/ws` endpoint, broadcast utility)
- OpenAPI docs auto-generated

## File Ownership

- `api/src/models/` — SQLAlchemy models (12 files, kebab-case → use snake_case per Python convention)
- `api/src/schemas/` — Pydantic DTOs
- `api/src/api/` — Route handlers
- `api/src/auth/` — Port existing
- `api/src/ws/` — WebSocket manager
- `api/alembic/versions/0001_init.py` — Single migration

## Schema (12 Tables)

```
users(id, email, name, password_hash, api_key, role, created_at)
projects(id, slug, name, description, key_prefix, owner_id, settings_json, created_at)
project_members(project_id, user_id, role)

work_items(
  id, project_id, number, type, status, complexity,
  title, description, parent_id, blocked_by_ids[],
  branch_name, pr_url, pr_status, worktree_path,
  assignee_id, created_by, custom_fields,
  created_at, updated_at, deleted_at
)
work_item_events(id, work_item_id, actor_id, event_type, payload, created_at)
comments(id, work_item_id, author_id, body, type, created_at)
attachments(id, work_item_id, uploaded_by, filename, mime_type, size, storage_url, created_at)

workflows(id, project_id, name, version, definition, is_default, created_at)
workflow_runs(id, work_item_id, workflow_id, version, current_node_ids[], state, context, started_at, finished_at)

agent_definitions(id, project_id, role, default_model, system_prompt, allowed_tools, created_at)
agent_sessions(id, workflow_run_id, node_id, role, model, status, prompt, output, tokens_in, tokens_out, cost_usd, started_at, finished_at)
agent_messages(id, from_session_id, to_session_id, kind, content, created_at)

devices(id, project_id, name, status, last_heartbeat_at, max_workers, capabilities)
queue_items(id, workflow_run_id, agent_session_id, status, attempts, locked_by, locked_at, payload, created_at)
```

## Implementation Steps

1. **Models** — write 12 SQLAlchemy models in `api/src/models/*.py`, snake_case file names
2. **Pydantic schemas** — pair each model with Create/Update/Read DTOs
3. **Alembic init** — autogenerate single migration, review SQL, `alembic upgrade head`
4. **Auth port** — copy JWT + API key middleware from legacy, adapt to new `users` table
5. **CRUD routes** (router-per-resource):
   - `routes/projects.py` — list/create/get/update/delete
   - `routes/work_items.py` — list/create/get/update/delete + tree + bulk
   - `routes/comments.py`, `routes/attachments.py`
   - `routes/workflows.py` — list/create/get/update/delete (no execution yet)
   - `routes/agent_definitions.py`
   - `routes/devices.py`, `routes/queue.py`
6. **Event log helper** — `services/audit.py:log_event(work_item_id, actor, type, payload)` called from all mutation routes
7. **WebSocket manager** — `ws/manager.py` with `broadcast(channel, event)`; channels: `project:{id}`, `item:{id}`, `run:{id}`
8. **Seed data** — `scripts/seed-dev.py`: 1 user, 1 project, 4 default agent_definitions (lead/coder/researcher/reviewer)
9. **OpenAPI verify** — `/docs` renders all endpoints
10. **Postman collection** — `api/postman/bumblebee-v2.json` — smoke test all CRUD

## Todo

- [ ] 12 SQLAlchemy models
- [ ] 12 Pydantic schema sets (Create/Update/Read)
- [ ] Alembic 0001_init migration
- [ ] Apply migration to dev DB
- [ ] Auth middleware port (JWT + API key)
- [ ] CRUD routes per resource
- [ ] `services/audit.py` event log helper
- [ ] WS manager + `/ws` endpoint
- [ ] `scripts/seed-dev.py`
- [ ] Postman collection
- [ ] Unit tests: model constraints, schema validation
- [ ] Integration test: full CRUD flow per resource

## Success Criteria

- [ ] `alembic current` shows `0001_init`
- [ ] All 12 tables exist via `\dt` in psql
- [ ] Postman collection 100% green
- [ ] `pytest api/tests/` passes (unit + integration)
- [ ] Coverage ≥ 70% for `models/`, `schemas/`, `api/`
- [ ] WS broadcast verified: subscribe channel → receive event
- [ ] `/docs` renders all endpoints
- [ ] Seed creates 1 working user + project + 4 agent_definitions

## Risks

- Schema design flaw discovered later: P2/P3/P4 force migration. Mitigation: schema review with stakeholder before merge P1.
