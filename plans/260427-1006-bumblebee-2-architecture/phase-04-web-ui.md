# Phase 4 — Web UI Redesign

**Track:** B (frontend, parallel) | **Effort:** 2.5 weeks | **Status:** pending | **Depends:** P1

## Context

Refactor Web UI to fit workflow-as-data model. Add React Flow drag-drop builder + live run viewer. Refresh design system for 7-status lifecycle + branch/PR tracking + 3 modes.

Track B can start after P1 schema is fixed. Use mock data for workflow run viewer until P3 lands; wire WS streaming when ready.

## Requirements

- New routes structure (workflow library, editor, runs, agents config)
- React Flow v12 (`@xyflow/react`) workflow builder + run viewer
- 3 board views (List/Kanban/Timeline) — port + simplify
- Item detail page with new tabs (Activity / Branch & PR / Workflow Run / Agent Sessions / Sub-items)
- Refreshed design tokens for 7-status lifecycle + node color palette
- WS subscribe per channel: `project:{id}`, `item:{id}`, `run:{id}`
- 3 orchestration modes UI (Auto/Explicit/Manual selector per project)
- A2A messages visualized in Agent Sessions tab

## File Ownership

```
web/src/
  app/projects/[slug]/
    board/page.tsx           — Kanban (default)
    list/page.tsx
    timeline/page.tsx
    items/[number]/page.tsx
    workflows/page.tsx       — Library + templates
    workflows/[id]/page.tsx  — Drag-drop editor
    runs/page.tsx            — Runs history
    runs/[id]/page.tsx       — Live graph viewer
    agents/page.tsx          — Role config
    devices/page.tsx
    settings/page.tsx
  components/workflow/
    builder/
      workflow-canvas.tsx
      node-palette.tsx
      node-properties-panel.tsx
      node-types/
        agent-node.tsx
        parallel-node.tsx
        condition-node.tsx
        human-approval-node.tsx
        git-node.tsx
        update-node.tsx
        delay-node.tsx
        trigger-node.tsx
      edge-condition-editor.tsx
      workflow-validator.ts
    viewer/
      run-canvas.tsx
      node-status-badge.tsx
      agent-session-drawer.tsx
    templates/
      template-picker.tsx
  components/work-items/
    views/
      kanban-board.tsx       — Refactor (7 status columns)
      hierarchy-list.tsx
      timeline-view.tsx
    detail/
      detail-page.tsx
      tabs/
        activity-tab.tsx
        branch-pr-tab.tsx     — NEW
        workflow-run-tab.tsx  — NEW
        agent-sessions-tab.tsx
        sub-items-tab.tsx
    shared/
      view-switcher.tsx
      filter-bar.tsx
      mode-selector.tsx       — NEW (Auto/Explicit/Manual)
  hooks/
    use-workflow-run.ts       — Subscribe WS, build live graph state
    use-agent-stream.ts       — Refactor existing
  lib/
    api/                      — Typed REST clients (codegen from OpenAPI)
    ws-client.ts
```

**Boundary:** `web/src/` only. Coordinate with Track A on API contract via OpenAPI spec.

## Design System Updates

- **Status palette (7 colors):** open=slate, planned=indigo, in_progress=amber, in_review=violet, done=emerald, blocked=rose, cancelled=zinc
- **Node type colors:** agent=purple, condition=blue, human=orange, git=gray, update=green, trigger=teal
- **PR status badges:** draft=gray, open=green, merged=purple, closed=red (GitHub-style)
- **Complexity icons:** simple=⚡, complex=🧩
- **Mode badges:** auto=🟢, explicit=🟡, manual=🔵

## Implementation Steps

### Stage A — Foundations (3 days)
1. Install `@xyflow/react` + dependencies
2. Codegen typed API client from OpenAPI (`openapi-typescript`)
3. Refactor design tokens (`tailwind.config.ts`, status palette, node colors)
4. WS client refactor: subscribe by channel, typed events
5. Drop legacy components: `pipeline-progress.tsx`, old `agent-actions-bar.tsx` simplified

### Stage B — Workflow Builder (5 days)
6. `workflow-canvas.tsx` — React Flow wrapper with custom node + edge types
7. 8 node type components (visual + properties panel hooks)
8. `node-palette.tsx` — drag source list
9. `node-properties-panel.tsx` — dynamic form per node type (uses Zod schemas synced with backend)
10. `edge-condition-editor.tsx` — when/condition picker with autocomplete on context fields
11. `workflow-validator.ts` — client-side mirror of server validator (immediate feedback)
12. Save flow: serialize React Flow state → POST /workflows
13. Version selector + diff view between versions
14. `template-picker.tsx` — clone from 4 built-ins

### Stage C — Run Viewer (3 days)
15. `run-canvas.tsx` — same canvas but read-only with status badges
16. `use-workflow-run.ts` — WS subscribe `run:{id}`, build node statuses
17. Live highlight: pending=gray, running=blue pulse, done=green check, failed=red X
18. `agent-session-drawer.tsx` — click node → drawer with stream output
19. Approve button on human.approval node (POST /approve)
20. Cancel run button

### Stage D — Item Detail Refresh (3 days)
21. New `detail-page.tsx` two-column layout
22. Tabs: Activity / Branch & PR / Workflow Run / Agent Sessions / Sub-items
23. `branch-pr-tab.tsx` — branch name, commits list, PR live status, "Open PR" button
24. `workflow-run-tab.tsx` — embedded mini run-canvas
25. `agent-sessions-tab.tsx` — list sessions + A2A message tree
26. `sub-items-tab.tsx` — children + blocked_by chain (mini DAG)

### Stage E — Board Views (2 days)
27. Refactor Kanban for 7 status columns
28. List view: simplified, depth + children_count from `/tree` endpoint
29. Timeline view: light-touch refactor
30. `mode-selector.tsx` — project setting Auto/Explicit/Manual

### Stage F — Polish + tests (2 days)
31. Loading states, error boundaries, empty states
32. Keyboard shortcuts (j/k navigate, c create item, w open workflow editor)
33. Vitest unit: validator client-side, hooks
34. Playwright E2E: drag 5 nodes → connect → save → run → verify live viewer

## Todo

### Stage A
- [ ] Install React Flow + deps
- [ ] OpenAPI codegen
- [ ] Tailwind tokens refresh
- [ ] WS client refactor
- [ ] Drop legacy components

### Stage B (Builder)
- [ ] `workflow-canvas.tsx`
- [ ] 8 node type components
- [ ] `node-palette.tsx`
- [ ] `node-properties-panel.tsx` per type
- [ ] `edge-condition-editor.tsx`
- [ ] `workflow-validator.ts`
- [ ] Save + version flow
- [ ] `template-picker.tsx`

### Stage C (Viewer)
- [ ] `run-canvas.tsx`
- [ ] `use-workflow-run.ts` hook
- [ ] Live status highlighting
- [ ] `agent-session-drawer.tsx`
- [ ] Approve/cancel actions

### Stage D (Detail)
- [ ] New `detail-page.tsx`
- [ ] Activity tab (refactor)
- [ ] Branch & PR tab (NEW)
- [ ] Workflow Run tab (NEW)
- [ ] Agent Sessions tab + A2A tree
- [ ] Sub-items tab

### Stage E (Boards)
- [ ] Kanban 7-column
- [ ] List view
- [ ] Timeline view
- [ ] Mode selector

### Stage F (Polish)
- [ ] Loading + error + empty states
- [ ] Keyboard shortcuts
- [ ] Vitest unit tests
- [ ] Playwright E2E

## Success Criteria

- [ ] User vẽ workflow với 5+ nodes, save, no errors
- [ ] Run từ web UI → live viewer hiện node status updates qua WS
- [ ] Click node trong viewer → drawer hiện stream output
- [ ] Item detail Branch & PR tab hiện đúng (mock data nếu webhook chưa ready)
- [ ] 3 board views render 100 items không lag (virtual scrolling)
- [ ] All 4 templates clone-able from picker
- [ ] Vitest: validator + hooks ≥ 60% coverage
- [ ] Playwright: 5 E2E scenarios pass
- [ ] No console errors in production build
- [ ] Mode selector persists per project

## Risks

- React Flow learning curve: 1 dev focus full-time stage B (5d). Fallback: CLI YAML đủ dùng tạm if delayed.
- Codegen drift: regen on every API change, commit generated files
- WS reconnect race: exponential backoff + missed-event replay endpoint
