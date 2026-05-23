# Phase 05 — Image Upload + Clarify Skill + Gemini Vertex Runner

## Context Links
- [plan.md](plan.md)
- [phase-02-workflow-executor-claude-cli.md](phase-02-workflow-executor-claude-cli.md) — Runner interface
- [phase-04-web-ui-mvp.md](phase-04-web-ui-mvp.md) — task detail/raise UI

## Overview
- **Priority:** P2
- **Status:** pending
- **Week:** 5
- **Brief:** Multimodal entry point. User raises a task with an attached screenshot → Gemini Flash analyzes image + description → posts clarification questions → user answers → task moves to `planned`.

## Key Insights
- Gemini 2.5 Flash is cheapest multimodal model that handles UI screenshots well.
- Clarify must be cheap (per-task many invocations possible). Don't use Claude Opus.
- Adds two new Runners (Gemini Vertex + Claude API HTTP) — proves interface from Phase 02.
- Attachments live in object storage (S3-compatible) referenced by URL; never stored as DB blobs.

## Requirements

### Functional
- New web page: `/tasks/new` — title, description, drag-drop image upload (multiple).
- API: `POST /tasks` accepts `attachments[]` array of `{ url, kind, mime }`.
- API: `POST /attachments/sign` returns presigned upload URL (S3 PUT).
- Clarify skill (`.bumblebee/skills/clarify.md`) — gemini-vertex runner, gemini-2.5-flash model. Reads task + attachments → produces JSON `{ questions: [...], confidence: 0..1 }`.
- If `confidence > 0.8` → status auto-advances to `planned`.
- Else → status stays `clarifying`, questions posted as `task_events.kind='clarification'`.
- User answers via UI form; new event `kind='clarification_answer'`; clarify skill re-runs with full thread.
- One new runner: `GeminiVertexRunner` — POST to Vertex AI generateContent (multimodal). Claude side stays on ClaudeCLIRunner from Phase 02 — no HTTP API adapter (CLI handles all Claude work; see plan.md "Why CLI over API").

### Non-Functional
- Image max 10MB, max 5 per task.
- Vertex creds via env / ADC. Claude CLI auth handled by host login (no API key in env).
- All multimodal calls timeout 60s.
- Cost guardrail: per-project daily token cap (config in projects table; soft warn at 80%).

## Architecture

```
Web /tasks/new
   │ form submit (multipart-of-urls)
   ▼
POST /attachments/sign ──► S3 (presigned PUT)
   │
   ▼ user uploads directly to S3
   │
POST /tasks {attachments:[{url,...}]}
   │
   ▼
Task created, status=draft → clarifying triggered
   │
   ▼
WorkflowExecutor → GeminiVertexRunner
   │
   ▼ HTTP POST Vertex generateContent (text + image_url parts)
   │
   ▼ JSON response parsed
   │
   ├─ confidence > 0.8 → status=planned, payload.plan stored in session_context
   └─ else → status=clarifying, post questions event, await user answer
```

## Related Code Files (to create)

```
internal/runners/gemini_vertex.go         — Vertex AI HTTP client + Runner impl
internal/runners/multipart.go             — helper to assemble multimodal parts
internal/attachments/handler.go           — POST /attachments/sign
internal/attachments/storage.go           — S3 SDK wrapper (signing only)
internal/attachments/types.go
migrations/0004_attachments.up.sql        — attachments table
.bumblebee/skills/clarify.md              — multimodal prompt
internal/skills/loader.go                 — extend to support multimodal hints in frontmatter

# Web
web/app/tasks/new/page.tsx
web/components/tasks/upload-dropzone.tsx
web/components/tasks/clarify-thread.tsx   — shown on detail when status=clarifying
web/lib/upload.ts                         — sign + PUT
```

### Migration (0004_attachments.up.sql)

```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,         -- 'image','log','file'
  mime TEXT NOT NULL,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_task ON attachments(task_id);

ALTER TABLE projects
  ADD COLUMN daily_token_cap BIGINT,
  ADD COLUMN daily_token_used BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN daily_token_reset_at TIMESTAMPTZ NOT NULL DEFAULT now();
```

### Clarify skill (.bumblebee/skills/clarify.md)

```markdown
---
name: clarify
runner: gemini-vertex
model: gemini-2.5-flash
max_tokens: 2048
multimodal: true
output_format: json
---
You are a senior engineer triaging a bug/feature task.

Task title: {{.Task.Title}}
Description: {{.Task.Description}}
Attachments: {{range .Attachments}}- {{.URL}} ({{.Mime}}){{end}}
Prior clarification thread: {{.ClarificationThread}}

Decide:
1. Do you have enough information to write a plan? (confidence 0..1)
2. If not, what 1-3 specific questions would unblock you?

Respond ONLY as JSON:
{"confidence": 0.0, "questions": ["..."], "summary": "what you understood"}
```

## Implementation Steps

1. Add deps: AWS SDK v2 (S3) or minio-go.
2. Migration 0004 — attachments + token cap fields.
3. Implement `internal/attachments/storage.go` — `SignPut(key, mime) (url, expiresAt)`.
4. Implement `internal/attachments/handler.go` — POST /attachments/sign auth-gated.
5. Extend `POST /tasks` to accept attachments array (validate URLs are in our bucket).
6. Implement `internal/runners/gemini_vertex.go`:
   - read `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_REGION`, ADC creds
   - build multimodal `contents` array (text part + inline_data parts referencing presigned URLs)
   - parse JSON response, emit single `Event{Kind:End, Data:{output}}`
7. Register GeminiVertexRunner in `internal/runners/registry.go` alongside existing ClaudeCLIRunner.
8. Update `.bumblebee/skills/clarify.md` (replace stub from Phase 02).
9. Update `WorkflowExecutor` post-success hook: if skill `output_format=json` parse JSON; if `confidence > threshold` advance to planned; else stay in clarifying and write `task_events.kind=clarification`.
10. Web: `/tasks/new` page with upload-dropzone (uses sign endpoint then PUT).
11. Web: `clarify-thread.tsx` rendered on task detail when status=clarifying — shows questions, answer form, posts `POST /tasks/:id/clarification-answer` re-triggering clarify.
12. Token cap middleware: before any runner dispatch, check + increment counters; return 429 if cap.
13. Smoke test: upload screenshot, see questions appear, answer, observe transition to planned.

## Todo List
- [ ] S3 sign endpoint
- [ ] Attachments migration
- [ ] GeminiVertexRunner
- [ ] Runner registry update
- [ ] Clarify skill .md
- [ ] Executor JSON output handling + confidence gate
- [ ] Web upload dropzone
- [ ] Web /tasks/new page
- [ ] Web clarify-thread component
- [ ] Token cap middleware
- [ ] Multimodal smoke test

## Success Criteria
- User uploads screenshot of bug, creates task with description.
- Within 30s, clarification questions appear.
- After answering, task transitions to planned (or repeats with refined questions, max 3 cycles).
- Same task with confident description (no image) skips clarifying entirely.
- Token usage counter increments and enforces cap.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vertex auth (ADC) on dev machines | M | M | document gcloud auth application-default login; allow API key fallback |
| JSON parse failures from model | M | M | retry once with stricter prompt; on second fail mark needs_info |
| S3 cost runaway | L | M | bucket lifecycle: delete attachments on task done +30 days |
| Image leakage to model providers | M | M | document in README; allow per-project opt-out |
| Clarify loop infinite | M | L | max 3 cycles in workflow YAML; then status=needs_info |

## Security Considerations
- Presigned URL TTL 5 min for PUT, 60 min for GET.
- Bucket private; access via presigned only.
- Validate uploaded MIME server-side (head request after upload).
- Strip EXIF from images on upload (privacy).
- Vertex API key / ADC creds in env, never logged. Claude CLI auth via host login (no key in env).

## Rollback
- Disable clarify phase by editing workflow YAML (`runner: claude-cli` fallback).
- Disable upload by feature flag `BB_UPLOADS_ENABLED=0` (UI hides dropzone).

## Next Steps / Dependencies
- Phase 06 worktree manager assumes clarification done before parallel runs.
- Phase 07 distiller can use same Gemini runner.
