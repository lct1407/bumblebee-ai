# Phase 5 — CLI Parity

**Track:** C (CLI, parallel) | **Effort:** 1 week | **Status:** pending | **Depends:** P1

## Context

`cli-ts` becomes the only CLI. Adds workflow commands, item run, daemon worker, YAML I/O. Web ↔ CLI parity 100%.

Track C starts after P1 (typed API client). Wires real workflow execution when P3 lands.

## Requirements

- All existing item/comment/sprint commands ported to v2 schema
- New `bb workflow *` commands (list/show/create/edit/import/export/run)
- `bb item run <id> --workflow <name>` — trigger workflow_run via API
- `bb item status <id>` — live current node + progress
- `bb item approve <id> --gate <node_id>` — resume from human gate
- `bb daemon` — worker that dequeues queue (alternative to Tauri)
- YAML editor integration (`$EDITOR` for `bb workflow edit`)
- Shared API client codegen (same OpenAPI as web)
- Streaming output via WS (terminal-friendly: tokens flow inline)

## File Ownership

```
cli-ts/src/
  commands/
    item/
      list.ts
      create.ts
      show.ts
      update.ts
      run.ts            — NEW: trigger workflow
      status.ts         — NEW: live current node
      approve.ts        — NEW: resume human gate
      cancel.ts
    workflow/
      list.ts           — NEW
      show.ts           — NEW
      create.ts         — NEW (--from-template)
      edit.ts           — NEW (open $EDITOR)
      import.ts         — NEW (YAML/JSON file)
      export.ts         — NEW
      run.ts            — NEW (run YAML directly)
    comment/
      list.ts
      add.ts
    daemon/
      start.ts          — NEW (replaces Python daemon)
      status.ts
      stop.ts
    project/
      list.ts
      use.ts            — set active project
  api/                  — Codegen from OpenAPI
  ws-client.ts          — Subscribe + reconnect
  yaml-editor.ts        — $EDITOR launcher
  formatters/           — Table, JSON, YAML output formatters
  config.ts             — Read ~/.bumblebee/config.json
```

**Boundary:** `cli-ts/` only. Different directory from web — no conflict.

## Implementation Steps

### Stage A — Foundation (1 day)
1. OpenAPI codegen for typed API client (shared method as web)
2. WS client with reconnect + channel subscribe
3. Config loader (~/.bumblebee/config.json: api_url, api_key, default_project)

### Stage B — Item commands port (1 day)
4. Port `item list/create/show/update/cancel/comment/etc.` to v2 schema
5. Drop legacy fields (status alias, retry counter)
6. Add `--type, --status, --complexity` filters

### Stage C — Workflow commands (2 days)
7. `bb workflow list` — table output
8. `bb workflow show <name>` — pretty-print YAML + version history
9. `bb workflow create <name> --from-template <template>` — clone built-in
10. `bb workflow edit <name>` — open $EDITOR with YAML, save → API PUT
11. `bb workflow import <file.yaml>` — POST /workflows
12. `bb workflow export <name> > flow.yaml`
13. `bb workflow run <yaml-file> --item <id>` — trigger run via API

### Stage D — Run + monitor (1 day)
14. `bb item run <id> --workflow <name>` — start run, print run_id
15. `bb item status <id>` — fetch + render current node tree (ASCII), live update via WS
16. `bb item approve <id> --gate <node_id>` — POST approve
17. `bb item cancel <id>`

### Stage E — Daemon (1 day)
18. `bb daemon start [--max-concurrent 2]` — dequeue loop, same endpoints as Tauri daemon
19. `bb daemon status` — heartbeat info, current sessions
20. `bb daemon stop` — graceful shutdown
21. WS subscribe for queue events (faster than poll)

### Stage F — Tests + polish (1 day)
22. Vitest: command parsers, formatters, YAML I/O
23. Integration: mock API server, run each command
24. Smoke: `bb daemon` dequeue + complete 1 mock session
25. Help text + man-page-like `--help` for every command

## Todo

### Stage A
- [ ] OpenAPI codegen
- [ ] WS client
- [ ] Config loader

### Stage B
- [ ] Port item/comment/sprint commands
- [ ] Drop legacy fields

### Stage C
- [ ] `workflow list/show`
- [ ] `workflow create --from-template`
- [ ] `workflow edit` ($EDITOR)
- [ ] `workflow import/export`
- [ ] `workflow run`

### Stage D
- [ ] `item run --workflow`
- [ ] `item status` live ASCII tree
- [ ] `item approve`
- [ ] `item cancel`

### Stage E
- [ ] `daemon start` dequeue loop
- [ ] `daemon status`
- [ ] `daemon stop`

### Stage F
- [ ] Vitest unit
- [ ] Integration with mock API
- [ ] Daemon smoke test
- [ ] Help text per command

## Success Criteria

- [ ] **PARITY:** Every web action có CLI equivalent (verified by parity matrix doc)
- [ ] `bb workflow run flow.yaml --item BB-1` triggers + streams to terminal
- [ ] `bb item status BB-1` shows live node updates (WS)
- [ ] `bb daemon` dequeues and processes 1 mock session
- [ ] `bb workflow edit` opens $EDITOR, save persists
- [ ] All commands have `--help` with examples
- [ ] Vitest coverage ≥ 70% for `cli-ts/src/`
- [ ] npm pack: `npm-publishable` package builds
- [ ] Type check: `tsc --noEmit` clean

## Risks

- WS over CLI flaky on Windows: fallback to polling /workflow_runs/{id}
- $EDITOR unset: fallback prompt to use `vim`/`nano`/`code`
- Config file collision with v1 path: migration script in `bb config migrate`
