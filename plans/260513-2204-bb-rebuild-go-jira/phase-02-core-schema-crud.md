# Phase 02 — Core Schema + CRUD (W2: 2026-05-28 → 06-03)

> **Goal:** All Phase-1 tables created with transition CHECK constraints; full CRUD endpoints for projects, work_items, sprints, comments; soft delete; event log audit trail.

## Context links
- [plan.md](plan.md) §2.1, §2.5 Data model
- [Phase 01](phase-01-api-skeleton.md) (prereq)
- Research: `../reports/researcher-260513-2210-jarvis-flow-pipeline.md` (data-model ER)
- Research: `../reports/researcher-260513-2211-bb-pipeline-orchestrator.md` (event log pattern)

## Overview
- **Priority:** P0
- **Status:** pending
- **Effort:** 7 days

## Key insights from research
- **ADOPT (from jarvis):** `event_log` row per field change → activity tab is just a query
- **ADOPT (from BB v2):** soft delete via `deleted_at`, per-project `number` sequence (e.g. `PROJ-42`)
- **AVOID (from BB v2 audit):** 14 statuses with aliases — clean 6 statuses, Postgres ENUM + CHECK
- **ADOPT (from jarvis):** `session_context JSONB` on work_items for Phase 07+ continuity
- **ADD (Jira-class):** custom fields (definitions + values tables), labels, parent_id self-FK tree

## Requirements

### Functional
1. Tables: `organizations`, `projects`, `sprints`, `work_items`, `work_item_comments`, `work_item_attachments`, `work_item_links`, `work_item_events`, `custom_fields`, `custom_field_values`, `saved_views`, `labels`
2. Postgres ENUMs: `work_item_status`, `work_item_type`, `work_item_priority`, `sprint_status`
3. CHECK constraint on `work_items.status` enforces allowed transitions (via trigger or service validator — pick approach day 1)
4. CRUD endpoints for all entities (list, get, create, patch, delete-soft)
5. Per-project work_item `number` sequence (gap-free per project, e.g. `BB-1`, `BB-2`)
6. Bulk update: `PATCH /api/projects/{key}/work-items/bulk` (ids + partial)
7. Tree endpoint: `GET /api/projects/{key}/work-items/tree` (flat list + depth + children_count for virtual scroll)
8. Event log auto-written on every field change (trigger or service hook)
9. Search endpoint: `GET /api/projects/{key}/work-items?q=...&status=...&assignee=...&type=...`

### Non-functional
- List endpoint p95 <100ms for 10k items (proper indexes)
- Bulk update atomic in single transaction
- Event log writes don't slow CRUD by >10%

## Data model (full schema)

```sql
-- migrations/000002_core_schema.up.sql

CREATE EXTENSION IF NOT EXISTS "citext";

-- Org (multi-tenant ready — phase 1 may use single default org)
CREATE TABLE organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            user_role NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- Project
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    key             TEXT NOT NULL,            -- "BB", "PROJ" — uppercase, ≤8 chars
    name            TEXT NOT NULL,
    description     TEXT,
    icon_url        TEXT,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    workflow_id     UUID,                     -- phase 07+
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (organization_id, key)
);

CREATE INDEX idx_projects_org_active ON projects (organization_id) WHERE deleted_at IS NULL;

-- Sprint
CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'completed');

CREATE TABLE sprints (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    goal        TEXT,
    status      sprint_status NOT NULL DEFAULT 'planned',
    starts_at   TIMESTAMPTZ,
    ends_at     TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_sprints_project_status ON sprints (project_id, status) WHERE deleted_at IS NULL;

-- Work items (the big one)
CREATE TYPE work_item_status AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled', 'blocked');
CREATE TYPE work_item_type AS ENUM ('epic', 'story', 'task', 'bug', 'subtask');
CREATE TYPE work_item_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE work_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number          INT NOT NULL,                             -- per-project sequence
    type            work_item_type NOT NULL DEFAULT 'task',
    parent_id       UUID REFERENCES work_items(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     JSONB,                                    -- TipTap JSON
    status          work_item_status NOT NULL DEFAULT 'backlog',
    priority        work_item_priority NOT NULL DEFAULT 'medium',
    assignee_id     UUID REFERENCES users(id),
    reporter_id     UUID REFERENCES users(id),
    sprint_id       UUID REFERENCES sprints(id) ON DELETE SET NULL,
    story_points    NUMERIC,
    due_date        DATE,
    labels          TEXT[] NOT NULL DEFAULT '{}',
    position        NUMERIC NOT NULL DEFAULT 0,               -- kanban order
    session_context JSONB,                                    -- phase 07+
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (project_id, number)
);

CREATE INDEX idx_work_items_project_status ON work_items (project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_sprint ON work_items (sprint_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_assignee ON work_items (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_parent ON work_items (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_labels ON work_items USING GIN (labels);

-- Per-project number sequence (atomic via trigger)
CREATE OR REPLACE FUNCTION assign_work_item_number() RETURNS trigger AS $$
BEGIN
    IF NEW.number IS NULL OR NEW.number = 0 THEN
        NEW.number := COALESCE(
            (SELECT MAX(number) + 1 FROM work_items WHERE project_id = NEW.project_id),
            1
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_item_number BEFORE INSERT ON work_items
    FOR EACH ROW EXECUTE FUNCTION assign_work_item_number();

-- Event log (audit trail)
CREATE TABLE work_item_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id  UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    actor_id      UUID REFERENCES users(id),
    event_type    TEXT NOT NULL,         -- "created", "status_changed", "assigned", "commented", ...
    field         TEXT,                  -- "status", "assignee_id", ...
    old_value     JSONB,
    new_value     JSONB,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_item_events_item ON work_item_events (work_item_id, created_at DESC);

-- Comments
CREATE TABLE work_item_comments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id  UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    author_id     UUID NOT NULL REFERENCES users(id),
    body          JSONB NOT NULL,         -- TipTap JSON
    body_text     TEXT NOT NULL,          -- for search
    parent_id     UUID REFERENCES work_item_comments(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_comments_work_item ON work_item_comments (work_item_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_body_fts ON work_item_comments USING GIN (to_tsvector('english', body_text));

-- Attachments
CREATE TABLE work_item_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id  UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    uploader_id   UUID NOT NULL REFERENCES users(id),
    filename      TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    BIGINT NOT NULL,
    storage_url   TEXT NOT NULL,           -- S3/Minio key
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

-- Links (relations: blocks, relates_to, duplicates)
CREATE TYPE link_type AS ENUM ('blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicated_by');

CREATE TABLE work_item_links (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    target_id      UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    link_type      link_type NOT NULL,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, target_id, link_type),
    CHECK (source_id != target_id)
);

-- Custom fields (Jira hallmark)
CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'date', 'datetime', 'select', 'multi_select', 'user', 'url', 'boolean');

CREATE TABLE custom_fields (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,             -- "story_points", "release_version"
    label       TEXT NOT NULL,
    field_type  custom_field_type NOT NULL,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {options: [...]} for select
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    UNIQUE (project_id, key)
);

CREATE TABLE custom_field_values (
    work_item_id   UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    value          JSONB NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (work_item_id, custom_field_id)
);

-- Saved views (Jira-style filter chips)
CREATE TYPE view_mode AS ENUM ('board', 'backlog', 'timeline', 'table');

CREATE TABLE saved_views (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id    UUID NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    mode        view_mode NOT NULL,
    query       JSONB NOT NULL,             -- {filters: [...], groupBy, sortBy}
    is_shared   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Labels (per-project palette)
CREATE TABLE labels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#94a3b8',
    UNIQUE (project_id, name)
);
```

## Status transition enforcement

Two options — pick day 1:

**Option A: Service-layer validator (chosen for v3.0)**
```go
var allowedTransitions = map[WorkItemStatus][]WorkItemStatus{
    "backlog":     {"todo", "cancelled"},
    "todo":        {"in_progress", "backlog", "cancelled", "blocked"},
    "in_progress": {"in_review", "todo", "blocked", "cancelled"},
    "in_review":   {"done", "in_progress", "blocked"},
    "done":        {},                       // terminal (re-open creates new item)
    "cancelled":   {},                       // terminal
    "blocked":     {"todo", "in_progress", "in_review", "cancelled"},  // resume to prev active
}
```
- Validated in `internal/workitems/service.go::UpdateStatus`
- Rejected transitions return RFC 7807 with `type:/errors/invalid-transition`
- Pro: easy to evolve; Con: bypassable via direct SQL

**Option B (defer to Phase 06):** Postgres trigger reads `allowed_transitions` table → enforce at DB

## API surface (Phase 02)

### Projects
- `GET /api/projects` — list (org-scoped)
- `POST /api/projects` — create
- `GET /api/projects/{key}` — detail
- `PATCH /api/projects/{key}` — update
- `DELETE /api/projects/{key}` — soft delete

### Work items
- `GET /api/projects/{key}/work-items` — filter+sort+paginate
- `POST /api/projects/{key}/work-items` — create
- `GET /api/projects/{key}/work-items/tree` — flat tree
- `PATCH /api/projects/{key}/work-items/bulk` — bulk update
- `GET /api/work-items/{id}` — detail
- `PATCH /api/work-items/{id}` — update (validates transitions)
- `DELETE /api/work-items/{id}` — soft delete
- `GET /api/work-items/{id}/children` — direct children
- `GET /api/work-items/{id}/events` — activity log
- `POST /api/work-items/{id}/transition` — status change with optional comment

### Sprints
- `GET /api/projects/{key}/sprints`
- `POST /api/projects/{key}/sprints`
- `PATCH /api/sprints/{id}`
- `POST /api/sprints/{id}/start`
- `POST /api/sprints/{id}/complete`

### Comments
- `GET /api/work-items/{id}/comments`
- `POST /api/work-items/{id}/comments`
- `PATCH /api/comments/{id}`
- `DELETE /api/comments/{id}`

### Custom fields
- `GET /api/projects/{key}/custom-fields`
- `POST /api/projects/{key}/custom-fields`
- `PATCH /api/custom-fields/{id}`
- `DELETE /api/custom-fields/{id}`

### Saved views
- `GET /api/projects/{key}/views` — my views + shared
- `POST /api/projects/{key}/views`
- `PATCH /api/views/{id}`

## Implementation steps

### Day 1 — Migrations + ENUMs
Write + run `000002_core_schema.up.sql`. Verify on staging.

### Day 2 — sqlc queries for projects + sprints
CRUD + list queries with filter args.

### Day 3 — work_items queries
List with filters (status[], type[], assignee, sprint), tree, bulk update.

### Day 4 — Handlers + transition validator
Wire all routes. Implement transition validator. Tests.

### Day 5 — Event log auto-write
Service layer wraps mutations; writes event row in same transaction. Bulk updates write one event per row.

### Day 6 — Comments + attachments + links + custom fields
CRUD handlers. Attachment upload uses presigned S3 URL (real Minio in Phase 05).

### Day 7 — Integration tests + smoke
End-to-end test: create project → create sprint → create epic+stories+tasks → transition statuses → comment → query tree. CI green.

## Related files
- New: `internal/projects/*`, `internal/workitems/*`, `internal/sprints/*`, `internal/comments/*`, `internal/customfields/*`, `internal/savedviews/*`, `migrations/000002_*`, `internal/db/queries/*.sql`
- Modified: `cmd/bb/serve.go` (route wiring)
- Deleted: none

## Todo list
- [ ] All tables migrated to staging
- [ ] sqlc generates clean code
- [ ] Transition validator unit-tested (every from/to pair)
- [ ] Per-project number sequence atomic under concurrent inserts (load test)
- [ ] Event log written for every mutation
- [ ] Bulk update transactional
- [ ] Tree endpoint returns flat list with depth (verify on 5-level deep test data)
- [ ] OpenAPI spec updated, lints
- [ ] CI green with testcontainers

## Success criteria (DoD)
- Can create project + sprint + epic + child stories + tasks via API
- Status transitions enforced (invalid → 422)
- Activity log shows all changes
- 10k work_items list endpoint returns in <100ms

## Risks
- **Risk:** Per-project number sequence race condition under heavy load — mitigation: trigger uses `LOCK TABLE` or `SELECT FOR UPDATE` on max(number) per project
- **Risk:** Event log table grows fast — mitigation: monthly partitioning post-1M rows (deferred Phase 09)
- **Risk:** TipTap JSON description may bloat — mitigation: enforce 64KB cap

## Next steps
→ [Phase 03 — WebSocket + Real-time](phase-03-websocket-realtime.md)
