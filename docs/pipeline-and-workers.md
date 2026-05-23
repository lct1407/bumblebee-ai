# Pipeline Orchestrator & Worker Architecture

## Overview

Bumblebee uses a **Pipeline Orchestrator** to auto-trigger agent phases when work item status changes, and **Workers** (Tauri desktop or CLI daemon) that dequeue and execute those phases.

## Pipeline Orchestrator

### How It Works

The orchestrator lives at `api/src/services/pipeline_orchestrator.py` and is called automatically when a work item's status changes (via REST, MCP, or CLI).

```
WorkItem status changes
  → work_items.py calls on_status_change()
  → Orchestrator checks:
    1. project.pipeline_config.enabled?
    2. Skill mapped for this status?
    3. Per-step toggle enabled?
    4. Dedup: same item+phase queued in last 2 min?
    5. Retry limit not exceeded?
  → Creates agent session + enqueues to queue
  → WS broadcast "queue:item_enqueued"
  → Worker dequeues and executes
  → On complete: status advances → triggers next step
```

### Status → Phase Mapping

**Stories / Bugs / Features:**

| Status | Phase | Description |
|--------|-------|-------------|
| `open` | `suggest` | Triage + analysis + proposal |
| `confirmed` | _(none)_ | Wait for user approval |
| `approved` | `execute` | Implement in git worktree |
| `in_review` | `test` | Run tests, verify implementation |
| `failed` | `reimplement` | Fix using failure context |

**Tasks:**

| Status | Phase | Description |
|--------|-------|-------------|
| `todo` | `suggest` | Analyze + plan |
| `in_review` | `test` | Run tests |
| `failed` | `reimplement` | Fix failures |

### Pipeline Config

Stored per-project in `projects.pipeline_config` JSONB:

```json
{
  "enabled": true,
  "auto_suggest": true,
  "auto_execute": false,
  "auto_test": true,
  "auto_reimplement": { "enabled": true, "max_retries": 3 },
  "auto_merge": false
}
```

- `enabled` — master switch for the pipeline
- `auto_suggest` — auto-analyze new items
- `auto_execute` — auto-implement after approval (set `false` if you want manual control)
- `auto_test` — auto-run tests after implementation
- `auto_reimplement` — auto-retry on test failure (up to `max_retries`)
- `auto_merge` — auto-merge to target branch after tests pass

Configure via Web UI at `/projects/[slug]/settings/pipeline` or directly via API:

```bash
curl -X PUT /api/projects/bumblebee \
  -d '{"pipeline_config": {"enabled": true, "auto_suggest": true, "auto_test": true}}'
```

### Full Automated Loop

```
Item created (status=open)
  → auto suggest → proposal comment → status=confirmed
  → User approve → status=approved
  → auto execute → implementation → status=in_review
  → auto test → PASS → status=resolved ✅
              → FAIL → status=failed
              → auto reimplement (attempt 1/3) → status=in_review
              → auto test → PASS → resolved ✅
                          → FAIL → reimplement (attempt 2/3)
                          → ... up to max_retries
                          → still FAIL → escalation comment, stays failed
```

### Deduplication & Safety

- **Dedup window**: Skips if same item+phase already queued/completed within 2 minutes
- **Retry limit**: Stops auto-reimplement after `max_retries` (default 3)
- **Manual trigger**: `POST /api/agent-sessions/pipeline/trigger/{item_id}` bypasses per-step toggles

---

## Worker Architecture

Workers dequeue from the agent queue and execute agent phases. Two implementations available.

### Agent Queue (PostgreSQL SKIP LOCKED)

All work goes through a PostgreSQL-backed queue:

- **Atomic dequeue**: `SELECT ... FOR UPDATE SKIP LOCKED` — no race conditions
- **Priority**: 0 (critical), 1 (high), 2 (normal), 3 (low)
- **Dead letter**: After `max_attempts` (3) failures → dead letter queue
- **Provider routing**: Queue items specify `required_provider` for multi-provider dispatch

### Worker Option 1: Tauri Desktop Daemon

The Tauri desktop app (`desktop/`) runs a background daemon.

**Setup:**
1. Install and launch the Tauri app
2. Login with email/password
3. Link a project (slug + local path)
4. Daemon auto-starts on launch

**Config** (`~/.bumblebee/desktop.toml`):
```toml
api_url = "https://api.bumblebee.dev"
auth_token = "eyJ..."
auto_start_daemon = true
max_workers = 2
headless_mode = true

[projects.bumblebee]
slug = "bumblebee"
path = "D:\\Sources\\bumblebee-cli"
```

- `max_workers` — max concurrent agents (default 2)
- `headless_mode` — `true` pipes stdout to API for web streaming; `false` opens visible console windows

### Worker Option 2: CLI Daemon

For machines without Tauri:

```bash
# WebSocket mode (recommended)
bb agent daemon start --ws --max-concurrent 2

# Legacy polling mode
bb agent daemon start --max-concurrent 2

# Stop / check status
bb agent daemon stop
bb agent daemon status
```

### Worker Lifecycle

Both workers follow the same lifecycle:

```
1. REGISTER DEVICE
   POST /api/devices/register
   Body: { name, hostname, device_uid, os, arch, max_concurrent, capabilities }
   → Receives device_id

2. CONNECT WEBSOCKET
   wss://{api_url}/ws?project={slug}
   → Listen for "queue:item_enqueued" events

3. DEQUEUE (on event or fallback poll every 60s)
   POST /api/queue/dequeue { device_id }
   → Atomic SKIP LOCKED claim
   → Returns queue item with session info

4. CONCURRENCY CHECK
   Semaphore(max_workers) — skip if at capacity
   Item stays in queue for another worker or next poll

5. SPAWN AGENT
   "bb agent <phase> <work_item_key>"
   e.g., "bb agent suggest BB-42"

6. STREAM OUTPUT (headless mode)
   Read stdout line by line (JSON stream)
   Batch 20 events or every 500ms
   POST /api/agent-sessions/{id}/relay-batch
   → WebSocket → Web UI sees real-time output

7. HEARTBEAT (every 30s)
   POST /api/devices/{id}/heartbeat
   → Keeps device marked as online
   → Prevents reaper from reclaiming queue items

8. COMPLETE
   POST /api/queue/{id}/complete (exit code 0)
   POST /api/queue/{id}/fail (exit code != 0)
   → Release semaphore slot
   → API auto-advances work item status
   → Pipeline orchestrator triggers next step

9. GRACEFUL SHUTDOWN (Ctrl+C or app close)
   POST /api/devices/{id}/offline
   → Running sessions continue to completion
   → No new items dequeued
```

### Concrete Example: Machine "DESKTOP-THANH" Connects

**14:00:00 — App starts, registers device:**
```
POST /api/devices/register
{
  "name": "DESKTOP-THANH",
  "hostname": "DESKTOP-THANH",
  "device_uid": "DESKTOP-THANH-12345",
  "os": "windows",
  "max_concurrent": 2,
  "capabilities": { "providers": ["claude-cli"] }
}
→ { "id": 5, "status": "online" }
```

**14:00:01 — WebSocket connected:**
```
wss://api.bumblebee.dev/ws?project=bumblebee
→ Listening for events...
```

**14:05:00 — User creates item "Add Google OAuth" on Web UI:**
```
POST /api/projects/bumblebee/work-items { title: "Add Google OAuth" }
→ Item BB-42 created (status=open)
→ Pipeline: auto_suggest=true → enqueue suggest phase
→ WS broadcast: "queue:item_enqueued"
```

**14:05:01 — Daemon receives event, dequeues:**
```
WS message: { event: "queue:item_enqueued" }
→ semaphore.try_acquire() → OK (0/2 slots used)
→ POST /api/queue/dequeue { device_id: 5 }
→ Returns: { id: "q-abc", session_id: "s-123", phase: "suggest" }
→ Spawn: "bb agent suggest BB-42"
```

**14:05:02 — Agent runs, output streams to Web UI:**
```
Claude analyzing BB-42...
stdout → daemon reads JSON lines → batches → POST /relay-batch
→ WebSocket → Web UI shows: "Reading source code... Analyzing auth flow..."
```

**14:05:30 — Heartbeat:**
```
POST /api/devices/5/heartbeat → OK
```

**14:07:00 — Suggest complete:**
```
bb agent suggest exits code 0
→ Proposal comment posted on BB-42
→ POST /api/queue/q-abc/complete
→ Status: open → confirmed
→ Pipeline: SKILLS["confirmed"] = None → wait for user
```

**14:15:00 — User approves, execute auto-triggers:**
```
User clicks "Approve & Execute"
→ PATCH /work-items/BB-42 { status: "approved" }
→ Pipeline: auto_execute=true → enqueue execute phase
→ Daemon dequeue → "bb agent execute BB-42"
→ Creates worktree, implements code, streams output
→ Done → status: in_review → auto test → ...
```

**Parallel execution (2 slots):**
```
14:15:01  Slot 1: BB-42 execute (running)
14:15:05  Slot 2: BB-43 suggest (running)
14:15:10  BB-44 suggest enqueued → semaphore full (2/2) → stays in queue
14:17:00  BB-43 done → slot freed → BB-44 dequeued automatically
```

---

## Fault Tolerance

### Device Goes Offline (crash, network loss)

```
Device heartbeat stops
  → 90s later: device_offline_checker marks device offline
  → stale_session_scanner finds orphaned sessions
  → Resets session to pending, re-enqueues queue items
  → WS broadcast "queue:item_enqueued" → other workers pick up
```

### Session Hangs (agent stuck)

```
Session running > 45 minutes with no activity
  → session_timeout_checker marks session failed
  → Queue item marked failed (may re-enqueue if attempts < max)
  → Pipeline may auto-reimplement if configured
```

### WebSocket Disconnects

```
WS connection lost
  → Auto-reconnect with 5s retry
  → Fallback: poll queue every 60s while disconnected
  → On reconnect: immediate dequeue attempt (catch up)
```

### Dead Letter Queue

```
Queue item failed 3 times (max_attempts)
  → Moved to dead_letter status
  → Visible in Web UI at /projects/[slug]/queue
  → User can retry manually (resets attempts, re-enqueues)
```

---

## Session Context Persistence

Work items have a `session_context` JSONB field that carries context across phases.

### How It Works

1. Agent completes a phase (e.g., suggest)
2. API extracts context summary from session messages:
   ```json
   {
     "currentState": "Completed suggest phase",
     "lastPhase": "suggest",
     "decisions": ["Use OAuth2 PKCE flow", "Add middleware for token refresh"],
     "filesModified": ["src/auth/google.py", "src/middleware/oauth.py"],
     "errorsResolved": [],
     "lastUpdated": "2026-03-21T14:07:00Z"
   }
   ```
3. Saved to `work_item.session_context`
4. Next phase (execute) reads this context and injects into prompt:
   ```
   ## Previous Session Context
   **Last Phase**: suggest
   **Key Decisions**:
     - Use OAuth2 PKCE flow
     - Add middleware for token refresh
   **Files Modified**:
     - src/auth/google.py
     - src/middleware/oauth.py
   ```

### Benefits

- Agent doesn't re-analyze what was already decided
- Failure context carries forward to reimplement phase
- Multi-step work items maintain coherent understanding

---

## Multi-Provider Support

Each phase can use a different AI provider, configured per-project:

```json
// project.phase_routing
{
  "suggest": { "provider": "claude-cli" },
  "execute": { "provider": "gemini-cli" },
  "test": { "provider": "claude-cli" }
}
```

Available providers:
- **claude-cli** — Local Claude Code CLI (default)
- **gemini-cli** — Google Gemini CLI
- **proxy** — Remote agent service

The dispatch service (`api/src/services/dispatch_service.py`) resolves the provider for each phase and sets `required_provider` on the queue item. Workers with matching capabilities pick it up.

---

## Web UI Pages

| Page | URL | Purpose |
|------|-----|---------|
| Pipeline Monitor | `/projects/[slug]/pipeline` | Stat cards (queued/running/done/failed), session list, cancel/retry |
| Pipeline Settings | `/projects/[slug]/settings/pipeline` | Per-step toggle switches, max retries |
| Agent Chat | `/projects/[slug]/agent` | Real-time stream viewer, session sidebar, desktop status |
| Queue Viewer | `/projects/[slug]/queue` | Queue items with phases, devices, dead letter + retry |
| Device Pool | `/projects/[slug]/devices` | Device cards with status, load, edit mode, running sessions |

---

## Quick Start

### 1. Enable Pipeline on Project

```bash
# Via API
curl -X PUT /api/projects/bumblebee \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"pipeline_config": {"enabled": true, "auto_suggest": true, "auto_test": true}}'

# Or via Web UI: /projects/bumblebee/settings/pipeline
```

### 2. Start a Worker

```bash
# Option A: Tauri desktop app (just launch it)

# Option B: CLI daemon
bb agent daemon start --ws --max-concurrent 2
```

### 3. Create a Work Item

```bash
bb item create "Add Google OAuth" --type story
# Pipeline auto-triggers suggest → daemon picks up → proposal posted
```

### 4. Monitor

- Web UI: `/projects/bumblebee/pipeline` for queue status
- Web UI: `/projects/bumblebee/agent` for real-time agent output
- CLI: `bb agent daemon status` for worker health
