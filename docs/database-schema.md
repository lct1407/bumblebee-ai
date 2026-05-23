# Database schema — entity reference

PostgreSQL 17 + SQLAlchemy 2.0 async + Alembic migrations.
Each table either:
- Is a **tenant boundary** (`workspaces`, `users`)
- Carries a `workspace_id` FK (= tenant-scoped)
- Is a **global registry** (`plugin_registrations`)

19 tables total. Source: `bumblebee/models/*.py`. Migrations: `alembic/versions/`.

---

## Entity map (boxes = tables, arrows = FKs)

```
                       ┌──────────────┐
                       │    users     │
                       │ (auth + me)  │
                       └──┬───────┬───┘
                          │       │
              owner_user_id    member_user_id
                          │       │
                          ▼       ▼
                       ┌──────────────────┐
                       │    workspaces    │  (Phase A — tenant)
                       │  + plan/Stripe   │
                       └──────┬───────────┘
                              │ workspace_id
            ┌─────────────────┼──────────────────────┐
            ▼                 ▼                       ▼
     ┌────────────┐   ┌────────────────┐    ┌──────────────────┐
     │  projects  │   │   workflows    │    │ agent_definitions│
     │ (1 per     │   │ (LangGraph     │    │ (1 per role:     │
     │  repo)     │   │   YAMLs)       │    │  triager, etc.)  │
     └─────┬──────┘   └───────┬────────┘    └────────┬─────────┘
           │ project_id        │ workflow_id          │ agent_def_id
           ▼                   ▼                      ▼
     ┌────────────┐   ┌──────────────────┐    ┌───────────────┐
     │   issues   │   │  workflow_runs   │◄───┤ agent_sessions│
     │ (BB-1 ...) │   │ (1 trigger=run)  │    │ (1 LLM call+)  │
     └─────┬──────┘   └────────┬─────────┘    └───────┬───────┘
           │                   │                       │
           │                   │ run_id                │ session_id
           │                   │                       │
           │                   ▼                       │
           │           ┌─────────────────────────────────┐
           ├──────────►│            events               │
           │ issue_id  │ (append-only canonical log)     │
           │           └─────────────────────────────────┘
           │
           ├──► comments (issue discussions)
           ├──► scope_leases (file-glob locks held by sessions)
           └──► knowledge_entries (scoped to project)

   workspace_members ──→ users (join)
   workspace_invites ──→ users (inviter), tracks pending invites
   chat_sessions ──→ projects (Q&A tier-2)
   notifications ──→ users (recipients)
   api_keys ──→ users (for REST + MCP)
   skills ──→ workspace_id (registered tools)
   plugin_registrations (global, no workspace_id)
```

---

## Tenant layer (Phase A)

### `workspaces`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | varchar(200) | display name |
| `slug` | varchar(100) unique | url-safe identifier |
| `owner_user_id` | UUID FK→users | RESTRICT (can't delete user with owned workspace) |
| `plan` | enum(free/pro/team) | Phase D billing |
| `stripe_customer_id` | varchar(64) | linked on first checkout |
| `stripe_subscription_id` | varchar(64) | linked on subscription create |
| `llm_spend_cents_this_period` | int | period counter, reset every 30d |
| `period_started_at` | timestamptz | for the reset cron |
| `payment_overdue` | bool | true → workflows blocked |
| `payment_overdue_since` | timestamptz | for the 7-day grace window |
| `settings` | JSONB | timezone, branding |
| `deleted_at` | timestamptz | soft-delete 30d → hard |
| `created_at`, `updated_at` | timestamptz | TimestampMixin |

### `workspace_members`
Join row binding user × workspace × role.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `workspace_id` | UUID FK CASCADE | |
| `user_id` | UUID FK CASCADE | |
| `role` | enum(owner/admin/member/viewer) | |

UNIQUE (workspace_id, user_id) — no duplicate memberships.

### `workspace_invites`
Pending invite with 7-day TTL.

| Column | Notes |
|---|---|
| `token` | url-safe random secret (32 bytes) |
| `email` | invitee email |
| `role` | role they'll get on accept |
| `expires_at` | TTL |
| `accepted_at` | nullable; becomes non-null on accept |
| `invited_by_user_id` | who sent it |

---

## Identity layer

### `users`
| Column | Notes |
|---|---|
| `email` | unique |
| `username` | unique |
| `password_hash` | nullable (OAuth-only users have NULL) |
| `oauth_provider` | 'google' / future 'github' etc. |
| `oauth_sub` | provider's stable user id |
| `avatar_url` | from OAuth profile |
| `is_admin` | platform admin (separate from workspace roles) |

UNIQUE INDEX (oauth_provider, oauth_sub) where oauth_provider IS NOT NULL.

### `api_keys`
For REST + MCP + CLI auth. Raw key shown once; hash stored.

| Column | Notes |
|---|---|
| `key_hash` | sha256 |
| `name` | human-readable label |
| `user_id` | nullable (system keys without owner) |
| `scopes` | JSONB array of permission names |

---

## Project + work layer

### `projects` (Phase A: + workspace_id)
| Column | Notes |
|---|---|
| `workspace_id` | FK CASCADE — Phase A tenant scope |
| `slug` | unique globally (for now; future: per-workspace) |
| `key` | short code, e.g. `BB` — used in issue numbering BB-1, BB-2, … |
| `policy_config` | JSONB — per-project budget ceilings, concurrency limits |
| `deploy_config` | JSONB — Coolify/Vercel hooks |
| `observability_config` | JSONB — OTel exporter URL etc. |
| `base_branch` | default `main`; merge target |

### `issues` (Phase A: + workspace_id; Phase E: + field-level events)
| Column | Notes |
|---|---|
| `workspace_id` | FK CASCADE |
| `project_id` | FK |
| `parent_id` | self-FK for hierarchy (epic→story→task) |
| `number` | per-project counter (BB-1, BB-2…) |
| `title` | required |
| `description` | markdown — sections parsed by `web/src/lib/issue-sections.ts` |
| `type` | enum(epic/story/task/bug/feature/chore/spike) |
| `status` | enum(new/triaged/planned/approved/in_progress/in_review/...) |
| `priority` | enum(critical/high/medium/low/none) |
| `complexity` | enum(simple/medium/complex) — set by Triager |
| `ai_summary` | text — set by Triager |
| `ai_suggested_solution` | text — set by Triager |
| `ai_acceptance_criteria` | JSONB array — set by Triager |
| `ai_confidence` | float 0-1 |
| `acceptance_criteria` | text (human-written; AI suggestion in JSONB) |
| `scope_hints` | JSONB array of glob patterns |
| `session_context` | JSONB — cached continuation context across sessions |

### `comments`
Discussion threads on issues. (Currently scaffold-only; no comments UI yet.)

---

## Agent runtime layer (Phases B, C)

### `agent_definitions`
| Column | Notes |
|---|---|
| `workspace_id` | FK (auto-scope listener fills from active workspace) |
| `name` | display |
| `role` | `triager`, `planner`, `implementer`, ... (11 roles) |
| `prompt_template` | LEGACY — Phase C externalises to `bumblebee/prompts/<role>.yaml` |
| `prompt_hash` | for cache invalidation |
| `default_tools` | JSONB array of skill names |
| `focus_areas` | JSONB array (descriptive only) |
| `default_budgets` | JSONB (wall_min / tokens_max / dollars_max) |
| `is_global` | true = available across all projects |

### `workflows`
| Column | Notes |
|---|---|
| `workspace_id` | FK |
| `name` | e.g. `simple-fix-flow` |
| `graph` | JSONB — the LangGraph DAG spec |
| `graph_hash` | for cache invalidation |
| `is_default` | one default per project |

### `workflow_runs`
One row per `POST /api/workflow-runs/trigger`.

| Column | Notes |
|---|---|
| `workspace_id` | FK |
| `workflow_id` | FK |
| `issue_id` | FK — what this run is about |
| `status` | running / completed / failed |
| `started_at`, `completed_at` | |

### `agent_sessions`
**The most important table.** One row per LLM invocation context (a "turn" or a "role-execution").

| Column | Notes |
|---|---|
| `workspace_id` | FK (auto-filled from issue) |
| `issue_id` | what we're working on |
| `workflow_run_id` | parent run |
| `agent_definition_id` | which agent persona |
| `role` | denormalized for quick filtering |
| `provider` | `stub`/`claude-cli`/`gemini` |
| `model` | e.g. `claude-opus-4-7` |
| `prompt_hash` | for replay/diff |
| `status` | enum(pending/running/completed/failed) |
| `phase` | enum mirror of issue.status the agent is driving |
| `budget_wall_min` | timeout |
| `budget_tokens_max` | per-session cap |
| `budget_dollars_max` | per-session cap |
| `tokens_in`, `tokens_out` | tallies |
| `dollars_used` | running cost |
| `failure_reason` | enum(BUDGET_EXCEEDED/INFINITE_LOOP/...) |
| `failure_detail` | error text |
| `scratch` | JSONB — short-term memory for the session |
| `checkpoint_id` | LangGraph checkpoint |
| `continues_from_id` | self-FK for multi-phase continuity |
| `workspace_branch` | git branch (for implementer sessions) |
| `workspace_path` | git worktree path |
| `chat_session_id` | nullable — set for chat-driven sessions |

### `scope_leases`
File-level locks held by agent sessions. **The thing that makes concurrent agents safe.**

| Column | Notes |
|---|---|
| `workspace_id` | FK |
| `issue_id` | which issue this is for |
| `session_id` | who holds it |
| `globs` | JSONB array of file patterns |
| `acquired_at` | timestamp |
| `expires_at` | TTL (default 10min); reaper releases stale ones |
| `released_at` | nullable; set on release |

**Acquisition logic**: a session can only acquire a lease if no other ACTIVE lease on the same issue has overlapping globs. Implemented as a transactional check + insert.

---

## State + memory layer

### `events` — **append-only canonical log**
Every meaningful action is an event row. This table is the authoritative state.

| Column | Notes |
|---|---|
| `workspace_id` | FK (auto-filled from issue/project/session) |
| `type` | string — `status_change`, `field_changed`, `llm_call`, `tool_use`, `session_started`, `session_completed`, ... |
| `payload` | JSONB |
| `project_id`, `issue_id`, `session_id`, `chat_session_id`, `workflow_run_id` | all nullable; whatever this event is about |
| `causation_id` | UUID — which event caused this one (lineage) |
| `source` | `user` / `agent` / `system` / `stripe` |
| `actor` | role name or username |
| `prompt_hash` | for replay |
| `occurred_at` | timestamptz |

**Never UPDATE this table.** All projections (IssueMemory, dashboards, audit log) read from here.

Auto-broadcast: `append_event()` also pushes the event over `/ws` to subscribed clients.

### `knowledge_entries`
Reusable facts about a codebase.

| Column | Notes |
|---|---|
| `workspace_id`, `project_id` | scope |
| `title` | one-line |
| `body` | longer markdown |
| `category` | enum(DECISION/CONVENTION/PITFALL/PATTERN/...) |
| `tags` | JSONB |
| `scope_globs` | JSONB — when to surface this entry in context |
| `use_count`, `last_used_at` | popularity decay |

### `skills`
The registered tool catalog. (Currently 12; Phase C plan was to grow to 15.)

| Column | Notes |
|---|---|
| `workspace_id` | FK |
| `name` | e.g. `read_file`, `write_file`, `run_tests` |
| `description` | for the LLM's tool-use prompt |
| `input_schema`, `output_schema` | JSON Schema |
| `side_effects` | bool (true = needs confirmation) |
| `idempotent` | bool |

---

## Chat + notifications

### `chat_sessions`
"Tier 2" Q&A interface — user chats with the Assistant agent.

### `notifications`
Inbox rows for workspace members. Surfaces in the `/notifications` page.

---

## Plugins

### `plugin_registrations`
Global (not workspace-scoped) registry of installed Python plugins discovered via `entry_points`. Each plugin can register Workflows, AgentDefinitions, KnowledgeEntries that get auto-tagged with `source=plugin:<name>`.

---

## Migration history

| Revision | Date | What |
|---|---|---|
| `20260518_0001` | initial schema | 14 core tables |
| `20260519_0001` | plugin_registrations | extensibility |
| `20260521_0001` | users + api_keys | auth |
| `20260525_0001` | **workspace tenancy** | 3 new tables + workspace_id everywhere |
| `20260522_0001` | **OAuth columns** on users | `oauth_provider`, `oauth_sub`, `avatar_url` |

To add a new migration:
```bash
cd D:/Source/bumblebee-v3
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## Auto-scope listener

`bumblebee/services/rbac/auto_scope.py` registers SQLAlchemy `before_insert` listeners that auto-fill `workspace_id` from a parent row when missing. Example: `AgentSession.workspace_id` derives from `issue_id.workspace_id`. This is a safety net so internal callers (and legacy seed scripts) don't have to thread the scope manually. Production paths should still set `workspace_id` explicitly for auditability.

Top-level entities (Project, Workflow, AgentDefinition, KnowledgeEntry, Skill) fall back to the first available workspace if no parent context exists.

## Indexes worth knowing

- `events`: `(issue_id, occurred_at DESC)` — supports the Activity timeline
- `events`: `(workspace_id, occurred_at DESC)` — supports the audit endpoint
- `agent_sessions`: `(status, started_at)` — supports stale-session scanner
- `scope_leases`: `(issue_id)` + `(released_at)` — supports acquire check + reaper
- `workspaces`: `(slug)` unique — used in every URL
- `workspace_members`: `(workspace_id, user_id)` unique — prevents duplicates
- `api_keys`: `(key_hash)` unique — lookup is hot path for every authed request
- `users`: `(oauth_provider, oauth_sub)` unique (partial) — OAuth dedup
