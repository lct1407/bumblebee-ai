# Phase 06 — Jira-style Advanced (W6: 2026-06-25 → 07-01)

> **Goal:** Custom fields end-to-end, saved views with JQL-lite parser, bulk actions, command palette (Cmd+K), global search.

## Context links
- [plan.md](plan.md) §2.6
- [Phase 02](phase-02-core-schema-crud.md) — custom_fields tables exist
- [Phase 05](phase-05-web-timeline-detail-editing.md) — FieldEditor exists
- Research: `../reports/researcher-260513-2211-bb-web-architecture-analysis.md` — Jira gaps list

## Overview
- **Priority:** P0
- **Status:** pending
- **Effort:** 7 days

## Jira-class hallmarks delivered in this phase

1. **Custom fields editor** (project settings page)
2. **Custom field display + edit** in board cards, table rows, detail page, filter bar
3. **JQL-lite query language** for advanced filters
4. **Saved views** with chips, sharing toggle
5. **Bulk actions bar** for multi-select operations
6. **Command palette (Cmd+K)** — jump-to-issue, run-action
7. **Global search** results page with facets
8. **Keyboard shortcuts** registry

## JQL-lite syntax

Subset of Jira JQL — parseable, type-safe:

```
status = todo AND assignee = me
status IN (todo, in_progress) AND priority >= high
type = bug AND created > "2026-05-01" AND labels CONTAINS "frontend"
sprint = "Sprint 12" AND NOT (status = done)
"Custom Field Name" = "value"
```

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `NOT IN`, `CONTAINS`, `IS EMPTY`, `IS NOT EMPTY`
Connectors: `AND`, `OR`, `NOT`, `()`
Functions: `me`, `currentSprint()`, `now()`, `startOfDay()`
Order by: `ORDER BY <field> ASC|DESC`

Parser implemented in Go (`internal/search/jql/parser.go`) using participle or hand-rolled recursive descent. AST → SQL WHERE clause via mapper.

## Components added

```
inputs/
  CustomFieldBuilder.tsx      - settings page: add/edit/reorder fields
  CustomFieldRenderer.tsx     - read-only display by type
  JQLInput.tsx                - autocomplete (field names, operators, values)
  SavedViewSelector.tsx       - dropdown w/ create/edit/delete
overlays/
  CommandPalette.tsx          - cmdk-powered, sections (issues, actions, navigation)
  BulkActionsBar.tsx          - fixed bottom bar when multi-select active
  KeyboardShortcutsModal.tsx  - help overlay (?)
search/
  GlobalSearchResults.tsx     - /search results page
  SearchFacets.tsx            - left sidebar w/ counts (type, status, project)
```

## Implementation steps

### Day 1 — Custom field definitions
1. Settings page `/projects/[key]/settings/fields`
2. `CustomFieldBuilder`: add field (type picker, label, key auto-derived, config per type)
3. Reorder via DnD
4. Backend: CRUD already done Phase 02; verify config validation per type

### Day 2 — Custom field display + edit
1. Board card: top-3 most-used fields visible (configurable per saved view)
2. Detail page right sidebar: all custom fields listed below built-ins
3. Inline edit via `FieldEditor` polymorphic component (Phase 05) extended for each type
4. Bulk update endpoint accepts `custom_field_values[]` patches

### Day 3 — JQL-lite parser (Go)
1. Lexer + parser → AST
2. AST validator: field exists, operator matches type, value parseable
3. AST → SQL: maps to WHERE clause with bind args
4. Test coverage: 50+ query samples (happy + edge cases)
5. Backend endpoint: `POST /api/projects/{key}/search` body: `{jql: "..."}`, returns work_items + facets

### Day 4 — JQL input UI + saved views
1. `JQLInput` with autocomplete (field names from project meta, operators per type, value suggestions for selects/users)
2. Syntax highlighting via CodeMirror or Monaco mini
3. "Save view" modal: name, mode (board/backlog/timeline/table), is_shared toggle
4. `SavedViewSelector` shows my views + shared, default + favorites

### Day 5 — Bulk actions
1. Multi-select rows in table view (Phase 02 endpoint exists) + cards in board (cmd+click)
2. `BulkActionsBar` shows count + actions: change status, change assignee, change sprint, add label, delete
3. Calls `PATCH /api/projects/{key}/work-items/bulk`
4. Optimistic + rollback w/ partial-failure UI

### Day 6 — Command palette + shortcuts
1. `cmdk` library, opens with Cmd+K (Ctrl+K on Win)
2. Sections:
   - Recent issues
   - Search results (typing live-queries)
   - Actions: "Create issue", "Switch project", "Open settings"
   - Navigation: "Go to Board", "Go to Backlog", "Go to Timeline"
3. Keyboard shortcuts registry (`web/lib/shortcuts.ts`):
   - Global: `?` help, `cmd+k` palette, `c` create issue, `/` focus search
   - Board: `g+b` board, `g+l` backlog, `g+t` timeline, `j/k` move card focus, `enter` open
4. `KeyboardShortcutsModal` shows all bindings (triggered by `?`)

### Day 7 — Global search + tests
1. `/search?q=...` page
2. Top bar search invokes ES-style full-text against work_items.title + description + comments.body_text
3. Facets sidebar: project, type, status (counts)
4. Backend: `GET /api/search?q=...` returns hits + facet counts (use Postgres `ts_rank` for ranking)
5. Vitest + Playwright tests; staging deploy

## Related files
- New: components above, `internal/search/jql/*`, `internal/search/handler.go`, `web/lib/shortcuts.ts`, `web/app/(protected)/search/page.tsx`, `web/app/(protected)/projects/[key]/settings/fields/page.tsx`
- Modified: `internal/workitems/handler.go` (search endpoint)
- Deleted: none

## Todo list
- [ ] Custom field CRUD UI + settings page
- [ ] Custom field display + inline edit everywhere
- [ ] JQL-lite parser w/ 50+ tests
- [ ] JQL input w/ autocomplete + syntax highlight
- [ ] Saved views w/ sharing
- [ ] Bulk actions bar functional
- [ ] Cmd+K palette w/ live search
- [ ] Keyboard shortcuts registry + help modal
- [ ] Global search page w/ facets

## Success criteria (DoD)
- Add custom field "Severity" (select), apply to bug type, edit on board card inline
- Type JQL `assignee = me AND status != done` → board filters in <500ms
- Save view "My Active Bugs" → appears in dropdown next session
- Cmd+K → type "Login bug" → arrow-down → enter → opens issue in <300ms total
- Multi-select 5 cards → change assignee → all update within 1s

## Risks
- **Risk:** JQL parser ambiguity (e.g. `assignee = me OR me`) — mitigation: precedence rules documented, parser tests as oracle
- **Risk:** Full-text search slow on 100k comments — mitigation: pre-compute `tsvector` column with trigger, GIN index
- **Risk:** Bulk action partial failures (3 of 5 succeed) — mitigation: response includes per-id status, UI shows partial-success state

## Next steps
→ [Phase 07 — Agent Layer A](phase-07-agent-workflow-runner.md) — workflow YAML + Claude CLI runner

**Note:** v3.0 MVP complete at end of Phase 06. Phase 07-09 = v3.1 agent layer + cutover. Decide with user whether to continue immediately or release v3.0 first.
