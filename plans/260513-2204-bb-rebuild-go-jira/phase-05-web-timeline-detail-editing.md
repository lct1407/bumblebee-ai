# Phase 05 — Web UI: Timeline + Detail + Editing (W5: 2026-06-18 → 06-24)

> **Goal:** Gantt timeline view, full-page issue detail, inline rich-text editing, comments, attachments, activity tab.

## Context links
- [plan.md](plan.md) §2.6
- [Phase 04](phase-04-web-shell-board-backlog.md) (prereq)
- Research: `../reports/researcher-260513-2211-bb-web-architecture-analysis.md` — detail-panel + detail-page port targets

## Overview
- **Priority:** P0
- **Status:** pending
- **Effort:** 7 days

## Key insights from research
- **PORT:** `detail-panel.tsx` (Sheet slide-in ~520px) and `detail-page.tsx` two-column from BB v2
- **ADD:** TipTap rich text editor for description + comments (replaces v2's plain textarea)
- **ADD (Jira gap):** inline edit on every field, no modal interruption
- **PATTERN:** activity tab queries `work_item_events` table; group consecutive events from same actor

## Routes
- `/projects/[key]/timeline`
- `/projects/[key]/issues/[number]` (full page)
- Detail panel: slide-over Sheet from any list view

## Components added

```
issue/
  IssueDetail.tsx              - full page + slide-over variants (same component)
  IssueDescriptionEditor.tsx   - TipTap, autosave 1s debounce
  IssueComments.tsx            - threaded comments w/ rich text
  IssueCommentItem.tsx         - single comment w/ edit/delete
  IssueActivity.tsx            - event timeline, grouped consecutive
  IssueFieldsPanel.tsx         - right sidebar: type, status, assignee, sprint, priority, labels, custom fields
  IssueLinks.tsx               - blocks/relates_to UI
  IssueAttachments.tsx         - drag-drop, presigned S3 upload
views/
  TimelineGantt.tsx            - zoomable horizontal bars
  TimelineRow.tsx              - epic/story bar w/ children indent
inputs/
  RichTextEditor.tsx           - TipTap config (bold, italic, code, link, mention, slash menu)
  FieldEditor.tsx              - polymorphic: text/number/date/select/user inline edit
  AttachmentDropzone.tsx
```

## Implementation steps

### Day 1 — Detail page + slide-over
1. `/projects/[key]/issues/[number]` two-column page (content left, fields right)
2. `<IssueDetail variant="page" | "panel" />` reused
3. Left col: title (editable), description (TipTap), tabs (Comments, Activity, Links, Attachments)
4. Right col: `IssueFieldsPanel`
5. Slide-over from board: clicking card opens Sheet with same IssueDetail

### Day 2 — TipTap rich text
1. `RichTextEditor` with extensions: StarterKit, Link, Mention (users), CodeBlockLowlight (syntax highlighting)
2. Slash command menu (`/heading`, `/code`, `/checklist`)
3. Autosave: 1s debounce → PATCH description
4. Optimistic save with conflict resolution (last-write-wins, show conflict toast if version mismatch)

### Day 3 — Inline field editing
1. `FieldEditor` polymorphic: click value → edit mode → blur/enter saves, esc cancels
2. Custom field type renderers: text, number, date, select, multi-select, user, url, boolean
3. Save fires PATCH, optimistic update, rollback on error
4. Permission check (read-only fields rendered as static)

### Day 4 — Comments
1. `IssueComments` lists comments oldest→newest with threading (parent_id one level deep)
2. Compose: TipTap mini editor at bottom
3. Edit own comment inline; delete own w/ soft confirm
4. WS event `comment:*` invalidates query
5. Mentions trigger notification (real notif system Phase 09)

### Day 5 — Activity tab
1. Query `GET /api/work-items/{id}/events`
2. Group consecutive events from same actor within 5min
3. Field change shows before/after diff (textual for strings, visual for arrays/JSON)
4. Comment events linked to comment in Comments tab

### Day 6 — Timeline (Gantt) view
1. `/projects/[key]/timeline`
2. Zoom: day/week/month (URL param)
3. Each row = epic or story with children indented
4. Bars drawn from due_date - story_points*day-estimate or explicit start_date custom field
5. Drag bar edges to adjust dates (optimistic + PATCH)
6. Today marker red line
7. Dependencies (blocks/blocked_by) drawn as arrows between bars

### Day 7 — Attachments + Minio setup
1. Coolify-deploy Minio (S3 alternative)
2. Backend `POST /api/work-items/{id}/attachments/presign` returns presigned PUT URL
3. Client uploads directly to Minio
4. After upload, `POST /api/.../attachments` confirms with metadata
5. Image previews inline (lightbox on click)
6. Tests + staging deploy

## Related files
- New: components above, `web/app/(protected)/projects/[key]/timeline/page.tsx`, `web/app/(protected)/projects/[key]/issues/[number]/page.tsx`, Minio terraform/manifest, `internal/attachments/*` (presign handler)
- Modified: `internal/workitems/service.go` (description update path)
- Deleted: none

## Todo list
- [ ] Detail page + slide-over share single component
- [ ] TipTap with autosave + conflict handling
- [ ] All fields inline-editable
- [ ] Comments w/ threading + WS-reactive
- [ ] Activity tab w/ grouped events + diffs
- [ ] Timeline Gantt zoomable + drag-resize
- [ ] Attachments via Minio presigned URL

## Success criteria (DoD)
- Edit description in tab A → saves in 1s, tab B shows new content within 1s of save
- Drag timeline bar → date updates, persisted, other tabs see it
- Comment with @mention → mentioned user (Phase 09) gets notification
- Attachment 10MB image uploads in <5s, preview inline

## Risks
- **Risk:** TipTap bundle size ~150KB — mitigation: lazy-load editor on first focus
- **Risk:** Concurrent edits to same description — mitigation: include version field in PATCH; reject + show conflict UI
- **Risk:** Gantt rendering perf for 1000+ items — mitigation: virtualize rows + only render visible time range

## Next steps
→ [Phase 06 — Jira-style Advanced](phase-06-jira-advanced.md)
