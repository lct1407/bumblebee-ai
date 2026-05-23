# Phase 3 — Agent Layer + Worker

**Track:** A (backend) | **Effort:** 1.5 weeks | **Status:** pending | **Depends:** P2

## Context

Bind workflow engine to real Claude sessions. Lead/specialist agent A2A model. Streaming output via WebSocket. Worker daemon dequeues queue and runs sessions.

## Requirements

- Agent runner: spawn `claude` CLI with role-specific prompt + allowed tools, capture streaming output
- 4 default roles: `lead`, `coder`, `researcher`, `reviewer` (writer optional)
- A2A messages: Lead → specialist via DB-backed `agent_messages` table; sync (wait) vs async (fire-and-forget)
- WebSocket streaming: tokens streamed live to `run:{id}` channel
- Worker daemon: dequeue from `queue_items`, lock with SKIP LOCKED, run session, post result, heartbeat
- Tauri daemon stays the main worker; expose dequeue + heartbeat REST endpoints (CLI daemon in P5 reuses)
- Token + cost tracking on each `agent_session` row
- Per-project budget cap (warn at 80%, block at 100%)
- Worktree management: create per work_item, cleanup on done

## File Ownership

```
api/src/agents/
  runner.py             — Spawn Claude CLI, stream stdout → WS, capture final
  roles.py              — Role config (default model, system prompt template, allowed tools)
  a2a.py                — Lead→specialist message dispatch (sync/async)
  worktree.py           — Per-item git worktree create/cleanup
  budget.py             — Token + cost tracker, budget cap enforcement
  prompts/              — System prompt templates per role
    lead.md
    coder.md
    researcher.md
    reviewer.md
api/src/api/queue.py    — Dequeue + heartbeat + complete + fail endpoints
api/src/api/agent_sessions.py — Session detail, stream replay
desktop/src-tauri/src/daemon/  — Worker daemon (refactor existing)
  dequeue.rs
  session_runner.rs
  heartbeat.rs
```

**Boundary:** Track A continues. Tauri Rust daemon coupled to Track A but in `desktop/` dir.

## A2A Communication Pattern

```
agent.run node executes:
  1. Create agent_session row (status=queued)
  2. Insert queue_item linked to session
  3. Mark workflow_run paused, return

Worker daemon:
  1. Dequeue queue_item (SKIP LOCKED)
  2. Resolve role + model + worktree
  3. Spawn claude CLI subprocess
  4. Stream stdout → POST /relay-batch → WS broadcast
  5. On exit:
     - status=completed/failed
     - tokens + cost recorded
     - POST /workflow_runs/{id}/resume with session output

Lead agent A2A:
  - Lead spawns child session via "tool call" → bumblebee MCP "delegate_to(role)"
  - Creates agent_message (kind=request) + child agent_session
  - SYNC: parent waits, MCP returns when child finishes
  - ASYNC: parent receives session_id, continues; later poll/notification
```

## Implementation Steps

1. **Roles config** — `roles.py` with default model + tool allowlist per role
2. **Prompt templates** — 4 markdown files; loader substitutes `{{item.title}}`, `{{context.research}}`, etc.
3. **Worktree manager** — `worktree.py`:
   - `ensure_worktree(work_item)` — `git worktree add` if missing
   - `cleanup_worktree(work_item)` — on item done/cancel
4. **Agent runner** — `runner.py`:
   - Build prompt from template + context
   - Spawn `claude --permission-mode bypassPermissions --output-format stream-json`
   - Read stdin/stdout async, parse JSON events, broadcast WS
   - Track tokens (from final message metadata)
   - Persist `agent_session` updates (status, tokens, output)
5. **A2A dispatcher** — `a2a.py`:
   - Implement bumblebee MCP tool `delegate(role, prompt, sync=true)`
   - Sync: create child session, await completion via DB poll
   - Async: create child session, return id immediately
   - Log every A2A in `agent_messages`
6. **Budget tracker** — `budget.py`:
   - Aggregate `agent_sessions.cost_usd` per project per day
   - Block agent.run at cap, emit WS alert
7. **Queue endpoints** — `api/queue.py`:
   - `POST /queue/dequeue` — atomic SKIP LOCKED, returns 1 item
   - `POST /queue/{id}/heartbeat` — refresh `locked_at`
   - `POST /queue/{id}/complete` — mark done, trigger workflow resume
   - `POST /queue/{id}/fail` — mark failed, increment attempts
8. **Tauri daemon refactor** — clean up existing daemon to use new endpoints; remove old phase-based logic
9. **Background scanners** (cron tasks):
   - `device_offline_checker` (60s)
   - `stale_session_scanner` (120s)
   - `session_timeout_checker` (120s, 45min cap)
10. **Tests:**
    - Mock Claude CLI: dummy script that emits stream-json events
    - Unit: budget cap, prompt template rendering, role resolution
    - Integration: full session run end-to-end with mock CLI
    - Integration: A2A sync wait
    - Integration: A2A async fire-and-forget
    - Load: 5 concurrent sessions, no DB deadlock

## Todo

- [ ] `roles.py` config
- [ ] 4 prompt template files
- [ ] `worktree.py` create/cleanup
- [ ] `runner.py` Claude CLI subprocess + stream
- [ ] `a2a.py` sync + async dispatch
- [ ] `budget.py` tracker + cap
- [ ] `api/queue.py` endpoints
- [ ] `api/agent_sessions.py` detail + replay
- [ ] Tauri daemon refactor (use new dequeue API)
- [ ] 3 background scanners (device offline, stale session, timeout)
- [ ] Mock Claude CLI for tests
- [ ] Unit + integration tests
- [ ] WS streaming verified end-to-end

## Success Criteria

- [ ] **MILESTONE:** `bb workflow run simple-task.yaml --item BB-1` (via raw API for now) runs real Claude, stream visible in WS, completes, work_item.status=done
- [ ] A2A sync: lead delegates to coder, waits, receives output
- [ ] A2A async: lead delegates, gets session_id, continues
- [ ] Budget cap blocks new run when daily cost exceeds limit
- [ ] Tauri daemon dequeues and processes 1 session correctly
- [ ] WS broadcast: `run:{id}` channel emits `node_started`, `agent_token`, `node_completed`
- [ ] Worktree created on first agent.run, cleaned on done
- [ ] Test coverage ≥ 70% for `api/src/agents/`

## Risks

- Claude CLI version drift: pin via `package.json` engines field, test on fresh install
- Subprocess deadlock on stderr: read both pipes async
- Long-running session blocks dequeue: heartbeat keepalive + 45min hard timeout
