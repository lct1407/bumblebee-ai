# Phase 04 — Web UI MVP (4 Core Routes)

## Context Links
- [plan.md](plan.md)
- [phase-02-workflow-executor-claude-cli.md](phase-02-workflow-executor-claude-cli.md) — EventBus
- [research/bb-v2-critical-audit.md](research/bb-v2-critical-audit.md) — pain 8 (UI over-engineered)

## Overview
- **Priority:** P1
- **Status:** pending
- **Week:** 4
- **Brief:** Next.js 16 web app, 4 routes only. shadcn/ui + Tailwind v4 + React Query. WebSocket stream consumer for live runner events.

## Key Insights
- v2 had 21 routes / 104 components. Cap MVP at 4 routes / ~25 components.
- React Query handles all server state — no Redux/Zustand for data.
- Single WebSocket connection multiplexes all task streams (subscribe by task_id).
- Visual: Notion/Obsidian wiki-feel. Off-white #FAFAF7 / dark #1F1E1B, accent #C2956E. Inter + IBM Plex Serif + JetBrains Mono.

## Requirements

### Functional
- Routes:
  - `/login`
  - `/tasks` — list with filter chips (status, project)
  - `/tasks/[id]` — detail: content (left) + live stream (right) + activity tab
  - `/wiki` — sidebar tree of `docs/knowledge/` + reader pane (Phase 07 fills content; Phase 04 ships the shell)
  - `/settings` — providers + skills (read-only listing in this phase)
- Login → JWT stored in httpOnly cookie via `/api/auth/proxy` Next route handler.
- Tasks list: server-rendered first page, client-side filtering thereafter.
- Task detail live stream: WS `wss://api/ws?token=...&topic=task:{id}`.
- Task action bar: status dropdown (only valid transitions enabled), Run Phase button.

### Non-Functional
- Lighthouse perf ≥ 90 on `/tasks`.
- Bundle <250KB gzipped initial JS.
- Components <200 lines.
- Mobile breakpoint at 768px (sidebar collapses).

## Architecture

```
Next.js 16 (app router)
  app/
    (auth)/login/page.tsx
    tasks/page.tsx                       — list
    tasks/[id]/page.tsx                  — detail
    wiki/page.tsx                        — browser (shell)
    wiki/[...slug]/page.tsx              — reader
    settings/page.tsx
    api/auth/proxy/route.ts              — login → cookie
    layout.tsx
  components/
    ui/                                  — shadcn primitives
    tasks/list-table.tsx
    tasks/filter-bar.tsx
    tasks/status-pill.tsx
    tasks/transition-menu.tsx
    tasks/detail-content.tsx
    tasks/live-stream.tsx
    tasks/activity-feed.tsx
    wiki/sidebar-tree.tsx
    wiki/reader.tsx
    settings/providers-card.tsx
    settings/skills-list.tsx
  lib/
    api-client.ts                        — typed fetcher
    ws-client.ts                         — WS multiplexer (singleton)
    query-keys.ts
  hooks/
    use-task-list.ts
    use-task.ts
    use-task-stream.ts
```

API additions for this phase:
```
internal/api/ws/handler.go               — WS endpoint, JWT auth via query param
internal/api/ws/multiplexer.go           — topic subscription
```

## Related Code Files (to create)

```
web/package.json                         — next 16, react 19, @tanstack/react-query, shadcn
web/tailwind.config.ts                   — v4 inline theme
web/app/globals.css                      — palette + fonts
web/app/layout.tsx
web/app/(auth)/login/page.tsx
web/app/tasks/page.tsx
web/app/tasks/[id]/page.tsx
web/app/wiki/page.tsx
web/app/wiki/[...slug]/page.tsx
web/app/settings/page.tsx
web/app/api/auth/proxy/route.ts
web/components/...                       — see arch above
web/lib/api-client.ts
web/lib/ws-client.ts
web/lib/query-keys.ts
web/hooks/use-task-list.ts
web/hooks/use-task.ts
web/hooks/use-task-stream.ts
web/middleware.ts                        — redirect to /login if unauth

# API side
internal/api/ws/handler.go
internal/api/ws/multiplexer.go
```

## Implementation Steps

1. `npx create-next-app@16 web --ts --tailwind --app`.
2. Install shadcn (`npx shadcn init`), add: button, card, dialog, dropdown-menu, input, sheet, table, tabs, toast, tooltip.
3. Set Tailwind v4 theme (palette + fonts) in `globals.css`.
4. Implement `lib/api-client.ts` (fetch wrapper, attaches JWT cookie).
5. Implement `lib/ws-client.ts` — singleton with `subscribe(topic, cb)`.
6. Implement `app/api/auth/proxy/route.ts` — POST forwards to API, sets `bb_token` httpOnly cookie.
7. `app/(auth)/login/page.tsx` — form posts to proxy.
8. `middleware.ts` — redirect `/` and unauth routes to `/login`.
9. `app/tasks/page.tsx` — server fetch first page, hydrate React Query.
10. Build list components: filter-bar, list-table, status-pill, transition-menu.
11. `app/tasks/[id]/page.tsx` — split layout (content + stream).
12. `live-stream.tsx` — uses `useTaskStream(id)` hook → WS subscription → renders event log.
13. `app/wiki/*` — shell only; sidebar reads `/api/wiki/tree` (stub returns empty array Phase 04, real in Phase 07).
14. `app/settings/page.tsx` — fetch `/api/providers` + `/api/skills` (read-only list).
15. API: implement `/ws` handler with topic multiplexer, EventBus subscription per topic.
16. Smoke test: log in → see tasks → open one → trigger run from API → events flow into stream pane.

## Todo List
- [ ] Next.js scaffold + Tailwind v4 theme
- [ ] shadcn primitives installed
- [ ] Login flow end-to-end
- [ ] Tasks list with filters
- [ ] Task detail layout
- [ ] WS client singleton
- [ ] Live stream component
- [ ] Activity feed (events tab)
- [ ] Wiki shell (empty-state ok)
- [ ] Settings read-only
- [ ] API /ws handler + multiplexer
- [ ] Lighthouse ≥ 90 verified

## Success Criteria
- User can log in.
- `/tasks` lists tasks with status filter chips working.
- Clicking a task opens detail; status dropdown only shows valid transitions.
- Triggering Run Phase shows live events streaming in within 2s.
- Bundle size budget met.
- Visual style matches Notion/Obsidian palette spec.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tailwind v4 breaking changes vs shadcn | M | M | use shadcn's tailwind-v4 branch; lock versions |
| WS reconnect storms | M | M | exponential backoff + jitter in ws-client |
| Next 16 RC instability | M | L | pin to latest stable; track release notes |
| Cookie SameSite issues across api+web origins | M | M | document same-origin deploy or set proper CORS+credentials |

## Security Considerations
- JWT in httpOnly cookie (no JS access).
- WS auth via short-lived token (issue 60s token from `/auth/ws-ticket`, redeem on connect).
- CSP header restricts script-src.
- Sanitize markdown in wiki reader (rehype-sanitize).

## Rollback
- Web is static — revert deploy to previous build.
- Disable WS endpoint via env flag; UI degrades to polling task events.

## Next Steps / Dependencies
- Phase 05 adds image upload UI in task raise form (new `/tasks/new` page, small extension).
- Phase 07 fills wiki content from generated knowledge files.
- Phase 08 adds review/merge gate UI on top of task detail.
