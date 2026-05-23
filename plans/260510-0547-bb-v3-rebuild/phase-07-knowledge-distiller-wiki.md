# Phase 07 — Knowledge Distiller + Wiki Auto-Gen

## Context Links
- [plan.md](plan.md)
- [phase-04-web-ui-mvp.md](phase-04-web-ui-mvp.md) — wiki shell exists
- [phase-05-image-upload-clarify-gemini.md](phase-05-image-upload-clarify-gemini.md) — Gemini runner reused
- [phase-06-worktree-parallel-sessions.md](phase-06-worktree-parallel-sessions.md) — read changed files
- [research/jarvis-agents-architecture-analysis.md](research/jarvis-agents-architecture-analysis.md) — dual-track knowledge

## Overview
- **Priority:** P2
- **Status:** pending
- **Week:** 7
- **Brief:** When task transitions to `done`, distill its essence into a markdown file under `docs/knowledge/{topic}/`. Auto-commit. Wiki UI reads filesystem.

## Key Insights
- Karpathy "wiki of skills" model: write what you learn, future agents read it back.
- Filesystem RAG (no vector DB) keeps complexity low; grep + frontmatter tags suffice for v3.
- Topic classification done by Gemini Flash (cheap).
- Backlinks computed at index time (build a graph from `[[wikilinks]]`).

## Requirements

### Functional
- New skill `.bumblebee/skills/distill.md` (gemini-vertex, gemini-2.5-flash).
- Workflow YAML: post-`done` hook triggers distill phase.
- Distiller inputs: task title, description, plan, implementation summary, test results, diff hunks (from worktree).
- Distiller output: markdown file with frontmatter `{topic, tags, related_tasks, created_at}` + body.
- File path: `docs/knowledge/{topic-slug}/{task-number}-{title-slug}.md`.
- Auto-commit to `docs` branch (or main repo's docs/ folder via webhook to docs repo — config).
- Indexer reads `docs/knowledge/` on startup + filesystem watch; builds in-memory tree + backlink graph.
- API: `GET /wiki/tree`, `GET /wiki/entry?path=...` (returns markdown + backlinks + related tasks).
- Web wiki page renders tree sidebar + reader pane (was shell in Phase 04).
- Search: simple substring search over titles + tags + body (no embeddings yet).

### Non-Functional
- Distill output <300 lines (enforced; truncate body if over, keep frontmatter).
- Index builds in <2s for ≤1000 entries.
- Markdown sanitized on render (rehype-sanitize).
- Wiki UI loads in <500ms after index ready.

## Architecture

```
Task status → done
        │
        ▼
WorkflowExecutor post-done hook
        │
        ▼
DistillRunner (Gemini Vertex)
   inputs: task + session_context + diff
   output: markdown
        │
        ▼
KnowledgeWriter
   - validates frontmatter
   - chooses path docs/knowledge/{topic}/{slug}.md
   - git commit ("knowledge: {title} (#TASK-NN)")
        │
        ▼
KnowledgeIndexer (fs watch)
   - builds tree
   - parses frontmatter
   - extracts [[wikilinks]] → backlink graph
        │
        ▼
GET /wiki/tree
GET /wiki/entry
```

## Related Code Files (to create)

```
internal/knowledge/distiller.go       — orchestrates distill skill + writer
internal/knowledge/writer.go          — file path selection + git commit
internal/knowledge/indexer.go         — fs walk + watch
internal/knowledge/parser.go          — frontmatter + wikilinks
internal/knowledge/graph.go           — backlink computation
internal/api/wiki/handler.go          — GET /wiki/tree, /wiki/entry, /wiki/search
.bumblebee/skills/distill.md
.bumblebee/workflows/default.yaml     — UPDATE: add distill post-done hook

# Web
web/app/wiki/page.tsx                  — UPDATE: tree + welcome
web/app/wiki/[...slug]/page.tsx        — UPDATE: real reader
web/components/wiki/sidebar-tree.tsx   — UPDATE: real tree from API
web/components/wiki/reader.tsx         — UPDATE: render markdown + backlinks
web/components/wiki/search-box.tsx     — substring search
web/lib/markdown.ts                    — unified+rehype config
```

### Distill skill (.bumblebee/skills/distill.md)

```markdown
---
name: distill
runner: gemini-vertex
model: gemini-2.5-flash
max_tokens: 4096
output_format: markdown_with_frontmatter
---
You are a technical writer summarizing a completed engineering task.

Task: {{.Task.Title}} (#{{.Task.Number}})
Description: {{.Task.Description}}
Plan: {{.SessionContext.plan}}
Implementation summary: {{.SessionContext.implementation_summary}}
Test results: {{.SessionContext.test_results}}
Files changed:
{{range .Diff.Files}}- {{.Path}} ({{.Adds}}+/{{.Dels}}-){{end}}

Write a knowledge entry. Format:

---
topic: <one of: api, frontend, infra, db, runner, workflow, debugging, general>
tags: [tag1, tag2]
related_tasks: [#{{.Task.Number}}]
---

# Title

## Problem
2-3 sentences.

## Solution
Concrete approach with key code references.

## Gotchas
What future-you should watch for.

## Related
[[other-entry-slug]] if relevant.

Keep total under 300 lines.
```

### Workflow YAML update

```yaml
post_hooks:
  - on_status: done
    runner: gemini-vertex
    skill: distill
    on_success: commit_knowledge
```

## Implementation Steps

1. Add deps: `github.com/fsnotify/fsnotify`, `github.com/yuin/goldmark` (or use existing), frontmatter parser.
2. Write `.bumblebee/skills/distill.md`.
3. Update workflow YAML loader to support `post_hooks`.
4. Implement `internal/knowledge/distiller.go` — assembles inputs (reads worktree diff via `git diff --stat`), invokes runner.
5. Implement `internal/knowledge/writer.go`:
   - parse frontmatter from runner output
   - slugify title, choose path
   - write file, `git add`, `git commit`, optional `git push`
6. Implement `internal/knowledge/parser.go` — frontmatter (yaml block) + wikilinks regex `\[\[([^\]]+)\]\]`.
7. Implement `internal/knowledge/indexer.go` — initial walk + fsnotify watcher.
8. Implement `internal/knowledge/graph.go` — backlink map `target → []source`.
9. Implement `/wiki/tree`, `/wiki/entry`, `/wiki/search` API handlers.
10. Web: real `sidebar-tree.tsx` (tanstack-query against /wiki/tree).
11. Web: real `reader.tsx` (unified + rehype-sanitize + remark-gfm; render wikilinks as Next links; show backlinks panel).
12. Web: `search-box.tsx` calling `/wiki/search?q=`.
13. Smoke test: complete a task end-to-end → wiki entry appears under topic folder → search finds it → backlinks resolve.

## Todo List
- [ ] Distill skill .md
- [ ] Workflow post_hooks support
- [ ] Distiller (assemble inputs)
- [ ] Writer (file + git commit)
- [ ] Parser (frontmatter + wikilinks)
- [ ] Indexer (walk + fsnotify)
- [ ] Backlink graph
- [ ] Wiki API handlers
- [ ] Web sidebar tree (real)
- [ ] Web reader with backlinks
- [ ] Search box
- [ ] Smoke: task done → wiki entry visible

## Success Criteria
- Completing a task produces a markdown file under `docs/knowledge/<topic>/`.
- Git log shows the commit.
- Wiki UI sidebar lists the new entry within 5s (fs watch).
- Clicking an entry renders markdown + shows backlinks panel.
- Search finds entry by tag and substring.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Distill output malformed (no frontmatter) | M | M | retry once with stricter prompt; on fail, save raw to `docs/knowledge/_unsorted/` and warn |
| Git commit conflict on docs branch | M | M | rebase + retry; on second fail, write to local + alert |
| File path collisions (same slug) | M | L | append `-N` suffix |
| fsnotify misses events on macOS | L | L | hourly full-walk fallback |
| Knowledge wiki accumulates noise | M | M | manual delete via PR; future: distiller revises existing entries instead of new file |

## Security Considerations
- Distill output sanitized (drop scripts, iframes) on render.
- Wiki API requires auth (same JWT).
- No user-uploaded markdown — only LLM-generated + reviewed by maintainers via PR.

## Rollback
- Disable post_hook in workflow YAML — distill no longer triggers; existing entries remain.
- `git revert` the docs commits if quality is poor.

## Next Steps / Dependencies
- Phase 08 relation detection scans wiki entries to suggest links between tasks.
- Future v3.1: replace substring search with embeddings + pgvector if scale demands.
