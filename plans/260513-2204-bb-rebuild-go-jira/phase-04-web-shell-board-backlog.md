# Phase 04 — Web UI: Shell + Board + Backlog (W4: 2026-06-11 → 06-17)

> **Goal:** Jira-style Next.js shell + Kanban board (DnD) + Backlog (sprint planning). All views WS-reactive.

## Context links
- [plan.md](plan.md) §2.6 Web UI
- [Phase 03](phase-03-websocket-realtime.md) (prereq)
- Research: `../reports/researcher-260513-2211-bb-web-architecture-analysis.md` — components to port + gaps for Jira

## Overview
- **Priority:** P0
- **Status:** pending
- **Effort:** 10 days (heaviest UI phase)

## Key insights from research
- **PORT AS-IS:** `kanban-board.tsx`, `hierarchy-list.tsx`, native HTML5 DnD pattern
- **CONSOLIDATE:** 3 approval bars → 1, 4 section files → 1, 6 badge variants → 1 lib
- **GAPS FOR JIRA:** swimlane persistence + multi-level grouping, inline custom-field edit, optimistic updates (current v2 has race condition with WS)
- **TanStack Query key hierarchy:** `["work-items", projectKey, "tree", filters]` for broad invalidation

## Jira-style design tokens (Tailwind v4 + shadcn)

```css
/* web/app/globals.css */
@theme {
  --color-primary: oklch(0.55 0.18 250);    /* Jira blue */
  --color-bg: oklch(0.99 0 0);              /* near-white */
  --color-bg-subtle: oklch(0.97 0 0);
  --color-border: oklch(0.92 0 0);
  --color-text: oklch(0.20 0 0);
  --color-text-muted: oklch(0.50 0 0);
  --color-status-todo: oklch(0.62 0.04 250);
  --color-status-progress: oklch(0.62 0.13 230);
  --color-status-review: oklch(0.65 0.13 280);
  --color-status-done: oklch(0.62 0.13 150);
  --color-status-blocked: oklch(0.62 0.13 30);
  --color-priority-urgent: oklch(0.55 0.20 25);
  --color-priority-high: oklch(0.62 0.14 50);
  --font-sans: 'Inter Variable', system-ui, sans-serif;
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --shadow-card: 0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04);
}
```

Dense Jira-style spacing: row height 32px, card padding 8px, sidebar nav 240px collapsible to 56px.

## Routes (in this phase)
- `/login`, `/projects` (list), `/projects/[key]/board`, `/projects/[key]/backlog`

## Component inventory (Phase 04 subset)

```
shell/
  TopNav.tsx                  - logo + breadcrumb + global-search + user-menu
  ProjectSwitcher.tsx         - dropdown w/ recent + favorites + create-new
  Sidebar.tsx                 - per-project nav (Board, Backlog, Timeline, Issues, Settings)
  BreadcrumbBar.tsx           - hierarchy w/ click to navigate up
  GlobalSearch.tsx            - cmd+K trigger, opens CommandPalette
  UserMenu.tsx                - avatar dropdown (settings, logout)
issue/
  IssueCard.tsx               - compact card for kanban/list (key, summary, assignee avatar, priority, labels)
  IssueRow.tsx                - dense table row variant
  IssueTransitionMenu.tsx     - dropdown to change status (validated transitions only)
  AssigneePicker.tsx          - searchable user picker with avatars
views/
  KanbanBoard.tsx             - columns + DnD + swimlanes toggle
  KanbanColumn.tsx            - column header + WIP limit + drop target
  BacklogList.tsx             - two-pane: unassigned + sprint panes, DnD between
inputs/
  FilterBar.tsx               - chips (status, assignee, type, priority, label) + saved-view selector
realtime/
  WSProvider.tsx              - Phase 03 (ported)
  ConnectionIndicator.tsx     - top-right green/yellow/red dot
```

## Implementation steps

### Day 1 — Auth + protected layout
1. `/login` page (email + password form, react-hook-form + zod)
2. JWT stored in `httpOnly` cookie via Next.js Route Handler (`POST /api/auth/login` proxy)
3. Middleware redirects unauth → `/login`
4. `/projects` lists user's projects

### Day 2 — Shell components
1. `TopNav` + `Sidebar` + `BreadcrumbBar` per layout spec
2. Sidebar collapse persisted via cookie
3. Project switcher with recent (last 5 from localStorage)
4. Skeleton loading states

### Day 3 — Kanban board structure
1. `/projects/[key]/board` page
2. `KanbanBoard` fetches via `useQuery(["work-items", projectKey, "by-status"])`
3. Status columns hardcoded for now (backlog/todo/in_progress/in_review/done)
4. Each column = `KanbanColumn` with stacked `IssueCard`s
5. WS event invalidates query → UI re-renders

### Day 4 — Kanban DnD
1. `@dnd-kit/core` + `@dnd-kit/sortable`
2. Optimistic update: drop → setQueryData (move card) → mutate API → revert on error
3. Position recalc: midpoint between neighbors (gapped numbering)
4. WIP limit warning if column.count > limit (project setting)

### Day 5 — Swimlanes
1. Toggle in board header: None | Assignee | Priority | Epic
2. Swimlane state persisted per-user per-project (localStorage + saved_views API later)
3. Multi-level grouping: outer (swimlane) × inner (status column)

### Day 6 — Backlog page
1. `/projects/[key]/backlog`
2. Two-pane: top = sprint panes (each sprint as accordion), bottom = unassigned (backlog status)
3. DnD between panes assigns/unassigns sprint_id
4. Sprint actions: Start (transitions planned→active), Complete (active→completed, prompts which items to move to next sprint)

### Day 7 — Filter bar
1. `FilterBar` chip-based: type, status (multi), assignee, priority, label, sprint
2. URL params drive state (`?status=todo,in_progress&assignee=me`)
3. Filter combined into TanStack Query key → invalidation-aware
4. "Save view" button (placeholder for Phase 06)

### Day 8 — Quick-add + issue card actions
1. `IssueQuickAdd` inline at bottom of each kanban column
2. Card hover: assignee picker quick-toggle, label chips, due-date warning
3. Right-click context menu: edit, move to sprint, link, delete

### Day 9 — Empty states + skeletons + a11y pass
1. Empty board → CTA
2. Skeleton cards during initial load
3. Keyboard nav across cards (`j/k` next/prev, `enter` open detail)
4. ARIA labels on all DnD operations

### Day 10 — Polish + tests + deploy
1. Vitest snapshot tests for components
2. Playwright e2e: login → create project → create issue → DnD across columns
3. Bundle analyzer: keep initial JS <250KB gzipped
4. Staging green

## Related files
- New: ~15 components above, `web/app/(protected)/layout.tsx`, `web/app/(protected)/projects/page.tsx`, `web/app/(protected)/projects/[key]/board/page.tsx`, `web/app/(protected)/projects/[key]/backlog/page.tsx`, `web/lib/api-client.ts`
- Modified: `web/app/layout.tsx`, `web/middleware.ts`
- Deleted: none

## Todo list
- [ ] Login + protected routing
- [ ] Shell (TopNav, Sidebar, ProjectSwitcher) responsive
- [ ] Kanban with WS-driven updates
- [ ] DnD with optimistic update + rollback
- [ ] Swimlanes (4 grouping options) persisted
- [ ] Backlog two-pane DnD
- [ ] Sprint start/complete actions
- [ ] FilterBar URL-driven
- [ ] Quick-add inline
- [ ] Keyboard nav

## Success criteria (DoD)
- Two tabs: drag card in tab A → tab B updates within 200ms
- Bundle <250KB initial JS
- Lighthouse perf >85 on board page
- WCAG AA on shell + board

## Risks
- **Risk:** DnD perf on 500+ cards — mitigation: virtualize columns >100 items
- **Risk:** Optimistic update + WS race (double-apply) — mitigation: dedupe by `updated_at` watermark
- **Risk:** Sprint completion with unfinished items — mitigation: modal asks "move to next sprint? close? backlog?"

## Next steps
→ [Phase 05 — Timeline + Detail + Editing](phase-05-web-timeline-detail-editing.md)
