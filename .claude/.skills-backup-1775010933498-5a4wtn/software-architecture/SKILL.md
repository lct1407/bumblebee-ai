---
name: software-architecture
description: |
  Guide for quality-focused software architecture in the Bumblebee monorepo.
  Use when writing code, designing architecture, analyzing code, reviewing PRs,
  or making any decision that relates to software development structure and quality.
  Covers Clean Architecture, DDD, layered patterns, cross-package boundaries,
  and Bumblebee-specific conventions for FastAPI, Next.js 16, Typer CLI, and Tauri.
---

# Software Architecture Skill

Guidance for quality-focused software development and architecture in the Bumblebee monorepo. Based on Clean Architecture and Domain-Driven Design principles, adapted for our specific tech stack and conventions.

## Bumblebee Monorepo Structure

```
api/       FastAPI backend (Python 3.12+)
cli/       Typer CLI tool (Python, `bb` command)
web/       Next.js 16 dashboard (TypeScript)
desktop/   Tauri desktop app (Rust + TypeScript)
docs/      Project documentation
```

**Cross-package boundary rule**: Packages MUST NOT import from each other directly. All communication flows through the REST API, WebSocket, or MCP protocol. Never import `api/` code from `cli/`, never import `web/` code from `desktop/`, etc.

## Layered Architecture

All packages follow a layered architecture. Data flows top-down; dependencies point inward.

### Python Backend (api/)

```
routers/          HTTP route handlers (thin controllers)
  work_items.py     Parse request, call service, return response
schemas/          Pydantic v2 request/response models
  work_item.py      WorkItemCreate, WorkItemUpdate, WorkItemResponse
models/           SQLAlchemy 2.0 async ORM models
  work_item.py      Database table definitions
services/         Business logic (when needed beyond CRUD)
dependencies.py   FastAPI dependency injection (auth, db session)
config.py         Settings via pydantic-settings
database.py       Async engine + session factory
```

**Rules:**
- Routers are thin controllers: parse input, call service/repository, return schema
- Business logic belongs in services, not in routers
- Database queries belong in repositories or model methods, not in routers
- Use Pydantic v2 schemas for all request/response validation
- Use SQLAlchemy 2.0 async patterns (`select()`, `AsyncSession`)
- Use `Depends()` for dependency injection (auth, database sessions)
- Dual auth: JWT Bearer token for web/desktop, `X-BB-API-Key` header for CLI/MCP

### TypeScript Frontend (web/)

```
src/
  app/              Next.js 16 App Router pages and layouts
  components/       UI components organized by domain
    work-items/       Domain-specific components
      views/            List, board, timeline views
      detail/           Detail panel and page
      shared/           Shared within this domain
    ui/               shadcn/ui primitives
  hooks/            React Query hooks and custom hooks
  lib/              Shared utilities (API client, auth, constants)
  types/            TypeScript type definitions
```

**Rules:**
- Props interface declared above the component, named `{ComponentName}Props`
- Server Components by default; add `"use client"` only when needed
- Data fetching via React Query hooks, never raw `fetch()` in components
- Tailwind v4 for styling, no CSS modules or styled-components
- shadcn/ui for all primitive UI components (Button, Dialog, Sheet, etc.)

### Python CLI (cli/)

```
bb_cli/
  commands/         Typer command groups (one file per domain)
    agent.py          bb agent suggest|execute|test|run|...
    items.py          bb item list|create|show|update|...
    comments.py       bb comment list|add
  api_client.py     HTTP client for API communication
  config.py         CLI configuration and auth storage
  main.py           Typer app entry point
```

**Rules:**
- Typer for CLI framework, Rich for terminal output (tables, panels, progress)
- All API communication through `api_client.py`, never direct HTTP calls in commands
- Commands are thin: parse args, call API client, format output

## Code Style Rules

### General Principles

- **Early return pattern**: Always use early returns over nested conditions for better readability
- Avoid code duplication through creation of reusable functions and modules
- Use arrow functions (TypeScript) or concise function definitions (Python) when appropriate
- **File size limit**: Keep files under 200 lines of code. If a file exceeds 200 lines, split it into multiple focused files
- **Component/function size**: Keep functions under 50 lines. Decompose long functions (80+ lines) into smaller units
- **Max nesting depth**: 3 levels. Refactor deeper nesting using early returns, extraction, or guard clauses

### Naming Conventions

- **Files**: Use `kebab-case` for all filenames across all packages (`work-item-card.tsx`, `api-client.py`)
  - Exception: Python modules use `snake_case` per PEP 8 (`work_item.py`, `api_client.py`)
- **AVOID** generic names: `utils`, `helpers`, `common`, `shared`, `misc`
- **USE** domain-specific names: `work-item-calculator`, `auth-middleware`, `sprint-formatter`
- Each module should have a single, clear purpose
- Follow bounded context naming: group by domain, not by technical role

### Python Conventions

- Type hints on all function signatures
- `async def` for all database and HTTP operations
- Pydantic v2 models for data validation (use `model_validator`, not `validator`)
- f-strings for string formatting
- `pathlib.Path` over `os.path`

### TypeScript Conventions

- Strict TypeScript (`strict: true`), no `any` types
- Named exports over default exports (except for Next.js pages)
- Interface over type alias for object shapes (except unions/intersections)
- Destructured props in function signature
- `const` by default, `let` only when reassignment is needed

## Best Practices

### Library-First Approach

- **ALWAYS search for existing solutions before writing custom code**
  - Check npm (TypeScript) or PyPI (Python) for libraries that solve the problem
  - Evaluate existing services/SaaS for common functionality
  - Consider third-party APIs before building custom integrations
- Use well-maintained libraries instead of writing custom utilities
- **When custom code IS justified:**
  - Business logic unique to Bumblebee's domain (work items, agent workflow, sprint management)
  - Performance-critical paths with special requirements
  - When external dependencies would be overkill for the use case
  - Security-sensitive code requiring full control (auth, token handling)

### Clean Architecture and DDD Principles

- **Domain-Driven Design**: Use ubiquitous language from the Bumblebee domain
  - Work items (not tickets/issues), sprints, projects, comments, events
  - Agent workflow: suggest, verify, execute, test, reimplement, merge
- **Separate domain entities from infrastructure concerns**
  - SQLAlchemy models define persistence, Pydantic schemas define contracts
  - Business rules live in services, not in routers or models
- **Keep business logic independent of frameworks**
  - Core logic should not depend on FastAPI, Next.js, or Typer specifics
  - Framework-specific code wraps domain logic, not the other way around
- **Bounded contexts by package**
  - `api/` owns the data layer and business rules
  - `web/` owns the presentation and user interaction
  - `cli/` owns the terminal interface and local agent orchestration
  - `desktop/` owns native OS integration and local codebase access

### Separation of Concerns

- Do NOT mix business logic with UI components
- Keep database queries out of route handlers (use services/repositories)
- Maintain clear boundaries between contexts
- Routers handle HTTP, services handle logic, models handle persistence
- React components handle rendering, hooks handle data fetching and state

### Error Handling

- **Python**: Use typed exceptions with proper hierarchy. Catch specific exceptions, never bare `except:`
- **TypeScript**: Use typed catch blocks. Handle API errors at the hook level, display at the component level
- Always provide meaningful error messages that help with debugging
- Use proper HTTP status codes in API responses (400 for validation, 401/403 for auth, 404 for not found)

## Anti-Patterns to Avoid

### NIH (Not Invented Here) Syndrome
- Do not rewrite what a library already does well
- Every line of custom code is a maintenance liability
- Prefer battle-tested solutions over clever custom implementations

### Poor Architectural Choices
- Mixing concerns (database queries in React components, UI logic in API routes)
- God objects/files that do everything (split by responsibility)
- Circular dependencies between modules

### Generic Naming Anti-Patterns
- `utils.ts` with 50 unrelated functions
- `helpers.py` as a dumping ground
- `common/` folder with no clear ownership

### Cross-Package Violations
- Importing Python code from `api/` into `cli/` (use HTTP client instead)
- Sharing TypeScript types between `web/` and `desktop/` without a shared package
- Duplicating models across packages instead of using API contracts

### Monorepo-Specific Anti-Patterns
- Running `npm install` or `pip install` at the repo root (each package manages its own dependencies)
- Shared configuration that couples unrelated packages
- Deploying all packages together when only one changed

## Data Patterns

### Bumblebee-Specific Conventions

- **Soft delete**: Use `deleted_at` timestamp, never hard delete
- **Per-project numbering**: Work items use project key prefix (e.g., BB-42)
- **Event history**: All field changes tracked in `work_item_events`
- **Unified work items**: Single `WorkItem` model with `type` discriminator (epic, story, task, bug, feature, chore, spike)
- **Self-referential hierarchy**: `parent_id` FK on `work_items` for nesting
- **Tree endpoints**: Return flat list with `depth` + `children_count` for virtual scrolling

### API Response Patterns

- List endpoints return paginated results with metadata
- Bulk operations accept arrays of IDs with partial update payloads
- WebSocket broadcasts notify all connected clients of state changes
- MCP server exposes the same data layer as REST, using tool-based interface

## Checklist Before Writing Code

1. Does a library already solve this? Check npm/PyPI first
2. Which package does this belong in? Respect cross-package boundaries
3. Is the file under 200 lines? Split if needed
4. Are functions under 50 lines? Extract if needed
5. Are names domain-specific? Avoid `utils`, `helpers`, `common`
6. Is the layering correct? Routes thin, logic in services, queries in repositories
7. Are types/schemas defined? Pydantic for Python, TypeScript interfaces for frontend
8. Is error handling in place? Typed exceptions, meaningful messages
9. Does it follow early return? Avoid deep nesting
10. Is it tested or testable? Keep logic pure and injectable
