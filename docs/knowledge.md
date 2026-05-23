# Bumblebee Project Knowledge

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL (asyncpg driver) |
| Auth | JWT (python-jose) + API keys (SHA-256 hashed) |
| CLI | Python Typer + Rich |
| Web | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, React Query v5 |
| Real-time | FastAPI WebSocket + browser WebSocket |
| AI Integration | MCP Streamable HTTP (Python MCP SDK), Claude CLI spawning |

## Project Structure

```
bumblebee-cli/
├── api/                    # FastAPI backend
│   ├── src/
│   │   ├── main.py         # App factory + route registration
│   │   ├── config.py       # pydantic-settings (reads .env)
│   │   ├── database.py     # Async engine + session
│   │   ├── dependencies.py # get_current_user (JWT + API key)
│   │   ├── auth/           # router, service, schemas
│   │   ├── models/         # SQLAlchemy models (WorkItem, Project, Sprint, Comment, etc.)
│   │   ├── schemas/        # Pydantic request/response
│   │   ├── routers/        # FastAPI routers (work_items, projects, comments, sprints, etc.)
│   │   ├── websocket/      # ConnectionManager + broadcast
│   │   └── mcp/            # MCP server (5 tools)
│   ├── alembic/            # Database migrations
│   └── pyproject.toml
├── cli/                    # Typer CLI (`bb` command)
│   ├── bb_cli/
│   │   ├── main.py         # Typer app + subcommand registration
│   │   ├── config.py       # ~/.bumblebee/config.toml
│   │   ├── api_client.py   # httpx wrapper
│   │   └── commands/       # Command modules (item, agent, comment, board, sprint, etc.)
│   └── pyproject.toml
├── web/                    # Next.js dashboard
│   └── src/
│       ├── app/            # Pages (App Router)
│       ├── components/     # Layout + shadcn/ui
│       ├── hooks/          # React Query hooks
│       └── lib/            # api client, types, websocket, utils
├── docs/                   # Documentation
└── references/             # Read-only reference projects
```

## Data Model

Unified work items with flexible nesting via parent_id self-FK:

```
User ──owns──→ Project ──has──→ WorkItem (type: epic/story/task/bug/feature/chore/spike)
                  │               ├──parent──→ WorkItem (self-reference, max 4 levels)
                  │               ├──has──→ Comment (type: discussion/investigation/proposal/review/agent_output)
                  │               ├──has──→ Label (M2M via work_item_labels)
                  │               ├──has──→ WorkItemEvent (field change history)
                  │               └──has──→ WorkItemRelation (blocks/relates_to/duplicates)
                  ├──has──→ Sprint
                  │           └──→ WorkItem (optional assignment)
                  ├──has──→ Label
                  └──has──→ AgentSession
```

### Key fields on WorkItem
- `number` — per-project auto-increment (unique with project_id)
- `key` — computed: `{project.key}-{number}` (e.g. BB-42)
- `type` — epic/story/task/bug/feature/chore/spike
- `status` — validated per type at application layer
- `priority` — critical/high/medium/low/none
- `parent_id` — self-FK for nesting (max 4 levels deep)
- `source` / `source_ref` — external origin tracking
- `deleted_at` — soft delete

## Status by Type

| Type | Statuses |
|------|----------|
| epic | open → in_progress → done → cancelled |
| story | open → confirmed → approved → in_progress → in_review → resolved → closed / failed / needs_info |
| task | backlog → todo → in_progress → in_review → done |
| bug | open → confirmed → in_progress → in_review → resolved → closed / wont_fix |
| feature | open → confirmed → approved → in_progress → in_review → resolved → closed |
| chore | open → in_progress → done |
| spike | open → in_progress → done |
| Sprint | planning → active → completed → cancelled |
| AgentSession | idle → running → completed → failed |

## Key Conventions

- **Work item IDs** are UUIDs, referenced by `number` or `key` (BB-42) in the UI/CLI
- **Project slug** is the primary lookup key for projects (unique, URL-safe)
- **Project key** is a short prefix for work item numbers (e.g. "BB")
- **Soft delete** via `deleted_at` timestamp — all queries filter `deleted_at IS NULL`
- **Event tracking**: Every field change creates a `WorkItemEvent` row
- **WebSocket events** follow pattern `entity:action` (e.g., `work_item:created`, `comment:created`)
- **MCP tools** use `action` parameter pattern (list/get/create/update) with JSON string `data`
- **Comment types**: discussion (default), investigation, proposal, review, agent_output

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | `postgresql+asyncpg://...localhost/bumblebee` |
| SECRET_KEY | JWT signing key | `change-me` |
| CORS_ORIGINS | Allowed origins (comma-separated) | `http://localhost:3000,http://localhost:1420` |
| NEXT_PUBLIC_API_URL | API URL for web frontend | `http://localhost:8000` |

## Agent Workflow

Two-phase autonomous coding loop:

### Phase 1: Suggest (`bb agent suggest <id_or_number>`)
1. Fetch work item details from API
2. Read project knowledge base (CLAUDE.md, docs/knowledge.md, .claude/lessons-learned.md)
3. Read previous comments (for continuation context)
4. Run Claude CLI with `--output-format text` in project directory (read-only analysis)
5. Post the analysis/plan as a proposal comment (`type=proposal, author=bb-agent`)
6. Update status: `open → confirmed`

### Phase 2: Execute (`bb agent execute <id_or_number>`)
1. Fetch work item + all comments (including the suggest plan)
2. Create git worktree at `~/.bumblebee/worktrees/{slug}/item-{number}` on branch `bb/item-{number}`
3. Start AgentSession via API
4. Update status: `→ in_progress`
5. Spawn Claude CLI with: `--output-format stream-json --verbose --permission-mode bypassPermissions --mcp-config -`
6. Stream output to terminal + relay to API → WebSocket → Web UI
7. On completion: post execution report as agent_output comment, status: `→ in_review`

### Continuation (`bb agent continue <id_or_number>`)
- Same as execute, reads all previous comments so Claude has full context

### Full Loop (`bb agent run <id_or_number>`)
- Runs suggest → prompts user to confirm → runs execute

### Worktree Management
- `bb agent worktrees` — list active agent worktrees
- `bb agent cleanup <item_number>` — remove worktree (optionally delete branch with `-D`)
- Worktrees stored at `~/.bumblebee/worktrees/{project_slug}/item-{number}`

## Common Operations

```bash
# Start API
cd api && uvicorn src.main:app --reload

# Run migrations
cd api && alembic revision --autogenerate -m "msg" && alembic upgrade head

# Install/run CLI
cd cli && pip install -e . && bb --help

# Start web dev server
cd web && npm run dev

# Build web for production
cd web && npm run build
```
