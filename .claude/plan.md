# Real-Time Agent Streaming - Implementation Plan

## Overview
Add real-time visibility into Claude CLI agent execution for both CLI and Web workflows.

**Key decisions:**
- Daemon: Long-running `bb agent daemon`
- Web without daemon: Hybrid (create session + show CLI command + auto-pickup)
- Replay: Summary in DB + local log file on disk

---

## Phase 1: Fix Streaming Infrastructure (CLI + API)
**Goal:** Buffered batch relay, phase tracking, unified streaming helper

### 1.1 API: Add `phase` column + batch relay endpoint

**File: `api/src/models/agent_session.py`**
- Add `AgentPhase` enum: `verify | suggest | execute | test | reimplement | merge | awaiting_confirmation | idle`
- Add columns:
  - `phase: Mapped[str | None]` (VARCHAR 30)
  - `branch_name: Mapped[str | None]` (VARCHAR 200)
  - `worktree_path: Mapped[str | None]` (VARCHAR 500)

**File: `api/src/schemas/agent_session.py`**
- Add `phase`, `branch_name`, `worktree_path` to `AgentSessionResponse`
- Add `AgentSessionRelayBatch` schema: `events: list[dict]`
- Add `AgentSessionPhaseUpdate` schema: `phase: str`

**File: `api/src/routers/agent_sessions.py`**
- Add `POST /{session_id}/relay-batch` endpoint:
  - Accept `{"events": [...]}`
  - Broadcast each event via WS (single broadcast with batch)
  - Do NOT write to `messages` JSONB per-event
  - Return `{"ok": True}` immediately
- Add `PATCH /{session_id}/phase` endpoint:
  - Update `phase` column
  - Broadcast `"agent:phase_change"` event
- Add `POST /{session_id}/complete` endpoint:
  - Accept `{"status": "completed"|"failed", "summary": dict}`
  - Update session status + store summary
  - Broadcast `"agent:completed"` or `"agent:failed"`

**File: `api/alembic/versions/` (new migration)**
- `alembic revision --autogenerate -m "add_phase_branch_to_agent_sessions"`
- Adds `phase`, `branch_name`, `worktree_path` columns

### 1.2 CLI: Extract shared streaming helper

**File: `cli/bb_cli/streaming.py` (NEW ~150 lines)**
```python
class AgentStreamer:
    """Shared streaming helper for all agent commands."""

    def __init__(self, session_id: str, log_dir: Path):
        self._session_id = session_id
        self._queue: queue.Queue = queue.Queue()
        self._done = threading.Event()
        self._log_file: Path  # ~/.bumblebee/logs/session-{id}.jsonl
        self._text_blocks: list[str] = []

    def start(self):
        """Start sender thread for batched relay."""
        self._sender_thread = threading.Thread(target=self._sender_loop, daemon=True)
        self._sender_thread.start()

    def feed(self, line: str):
        """Feed a raw JSON line from Claude stdout."""
        # Parse JSON, extract text blocks, put on queue, write to log file

    def stop(self) -> list[str]:
        """Signal done, flush remaining, return text_blocks."""
        self._done.set()
        self._sender_thread.join(timeout=5)
        return self._text_blocks

    def _sender_loop(self):
        """Background thread: drain queue, batch POST every 500ms or 20 events."""
        buffer = []
        while not self._done.is_set() or not self._queue.empty():
            try:
                item = self._queue.get(timeout=0.5)
                buffer.append(item)
            except queue.Empty:
                pass
            if len(buffer) >= 20 or (buffer and (self._done.is_set() or ...)):
                self._flush(buffer)
                buffer = []

    def _flush(self, events: list[dict]):
        """POST batch to API, swallow errors (log file is safety net)."""
        try:
            api_post(f"/api/agent-sessions/{self._session_id}/relay-batch",
                     json={"events": events})
        except Exception:
            pass  # Data preserved in log file
```

### 1.3 CLI: Refactor agent commands to use AgentStreamer

**File: `cli/bb_cli/commands/agent.py`**

Refactor these functions to use `AgentStreamer`:
- `_execute_one()` (lines 723-738): Replace inline relay loop → `streamer.feed(line)`
- `_reimplement_one()` (lines 891-902): Add relay (currently missing!) via `streamer.feed(line)`
- `_continue_one()`: Same pattern

Convert to streaming (Popen + stream-json):
- `_suggest_one()` (line 629): `subprocess.run` → `subprocess.Popen` + `AgentStreamer`
- `_test_one()` (line 789): `subprocess.run` → `subprocess.Popen` + `AgentStreamer`
- `_verify_one()`: `subprocess.run` → `subprocess.Popen` + `AgentStreamer`

Add phase tracking:
- Each `_*_one()` function calls `api_post(f"/api/agent-sessions/{session_id}/phase", json={"phase": "execute"})` at start
- `run()` function updates phase at each transition

Store branch/worktree on session:
- After `_create_worktree()`, update session: `api_put(f"/api/agent-sessions/{session_id}", json={"branch_name": ..., "worktree_path": ...})`

### 1.4 CLI: Local log file

**Directory:** `~/.bumblebee/logs/`
- File per session: `session-{id}.jsonl`
- Written by `AgentStreamer.feed()` (immediate append, no buffering)
- Retention: Keep last 30 days (cleanup in `bb agent cleanup`)

---

## Phase 2: Rich Live Dashboard for Batch Operations (CLI)
**Goal:** Real-time progress table when running batch commands

### 2.1 Progress tracker abstraction

**File: `cli/bb_cli/progress.py` (NEW ~120 lines)**
```python
class AgentProgressTracker(Protocol):
    def update(self, item_key: str, phase: str, status: str, last_line: str): ...
    def complete(self, item_key: str, success: bool, message: str): ...

class TerminalTracker:
    """Rich Live table showing all agents."""
    def __init__(self):
        self._table_data: dict[str, dict] = {}
        self._live: rich.live.Live

    def update(self, item_key, phase, status, last_line):
        self._table_data[item_key] = {
            "phase": phase, "status": status,
            "last_line": last_line[:60], "elapsed": ...
        }

    def __enter__(self): ...  # Start Rich Live
    def __exit__(self): ...   # Stop Rich Live

class SilentTracker:
    """No-op tracker for single-item runs."""
    ...
```

### 2.2 Wire into batch commands

**File: `cli/bb_cli/commands/agent.py`**

Modify `batch_run()`, `batch_execute()`, `batch_suggest()`:
- Wrap ThreadPoolExecutor block with `TerminalTracker` context manager
- Each `_*_one()` accepts optional `tracker: AgentProgressTracker` param
- Workers call `tracker.update()` on phase transitions and text output

**Display format:**
```
┌──────────┬─────────────┬─────────┬────────────────────────────────┐
│ Item     │ Phase       │ Status  │ Last Output                    │
├──────────┼─────────────┼─────────┼────────────────────────────────┤
│ BB-42    │ execute     │ running │ Modifying auth/router.py       │
│ BB-43    │ docker-test │ running │ Building api-test container... │
│ BB-44    │ suggest     │ done    │ Analysis posted as comment     │
└──────────┴─────────────┴─────────┴────────────────────────────────┘
 Elapsed: 3m 42s │ 1/3 complete │ Ctrl+C to abort
```

---

## Phase 3: Web Agent Stream Viewer
**Goal:** Live streaming output rendering on web dashboard

### 3.1 WebSocket event handling for streaming

**File: `web/src/hooks/use-websocket.ts`**
- Add listeners for new events:
  - `agent:phase_change` → invalidate `["agent-sessions"]`
  - `agent:completed` → invalidate `["agent-sessions"]`
  - `agent:failed` → invalidate `["agent-sessions"]`

**File: `web/src/hooks/use-agent-stream.ts` (NEW ~80 lines)**
```typescript
export function useAgentStream(sessionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [phase, setPhase] = useState<string>("idle")

  useEffect(() => {
    if (!sessionId) return

    // Listen for agent:output events matching this session
    const unsub1 = wsManager.on("agent:output", (data) => {
      if (data.session_id !== sessionId) return
      // data.payload may contain batch: events[]
      const newEvents = data.events || [data.payload]
      setEvents(prev => [...prev, ...newEvents])
    })

    const unsub2 = wsManager.on("agent:phase_change", (data) => {
      if (data.session_id !== sessionId) return
      setPhase(data.phase)
    })

    return () => { unsub1(); unsub2() }
  }, [sessionId])

  return { events, phase, clearEvents: () => setEvents([]) }
}
```

### 3.2 Stream viewer component

**File: `web/src/components/agent/agent-stream-viewer.tsx` (NEW ~180 lines)**

Renders structured stream-json events:
- `type: "assistant"` → Text blocks rendered as markdown
- `type: "tool_use"` → Collapsible section: "Tool: {name}" with input params
- `type: "tool_result"` → Result under the tool section
- Phase banner at each phase change
- Auto-scroll to bottom with "scroll lock" toggle
- Token counter + elapsed time in footer

**Props:**
```typescript
interface AgentStreamViewerProps {
  sessionId: string
  showPhase?: boolean
}
```

### 3.3 Stream event list component

**File: `web/src/components/agent/stream-event-list.tsx` (NEW ~150 lines)**

Renders individual events with proper formatting:
- Text content: rendered with whitespace preservation, code blocks
- Tool calls: collapsible accordions with name, input, output
- Thinking blocks: dimmed/collapsible
- Error blocks: red highlighted

### 3.4 Update agent page

**File: `web/src/app/projects/[slug]/agent/page.tsx`**
- Replace raw JSON message display with `AgentStreamViewer`
- Add phase indicator badge next to session status
- Show branch name when available
- Keep existing session list sidebar

---

## Phase 4: CLI Daemon + Web Spawn
**Goal:** Web dashboard can trigger agent execution via daemon

### 4.1 API: Spawn request + approve/reject endpoints

**File: `api/src/routers/agent_sessions.py`**

New endpoints:
- `POST /{session_id}/claim` — Daemon claims a pending session (atomic, first-wins)
  - Sets `claimed_by` field (machine/daemon ID)
  - Returns 409 if already claimed
- `POST /{session_id}/approve` — User approves after verify phase
  - Sets phase to `execute`
  - Broadcasts `"agent:proceed"`
- `POST /{session_id}/reject` — User rejects with reason
  - Sets phase to `rejected`, status to `failed`
  - Broadcasts `"agent:rejected"`

**File: `api/src/models/agent_session.py`**
- Add `claimed_by: Mapped[str | None]` (VARCHAR 100)

**File: `api/src/routers/agent_sessions.py`**
- Modify `POST /start`:
  - If `origin == "web"`: set status to `pending` (not `running`)
  - Broadcast `"agent:spawn_request"` event

### 4.2 API: WebSocket bidirectional for daemon

**File: `api/src/main.py`**
- Add new WS endpoint: `/ws/daemon`
  - Authenticated (token in query param or first message)
  - Receives stream events from daemon (replaces HTTP relay)
  - Broadcasts to project-scoped `/ws` clients
  - Handles `spawn_request` dispatch to connected daemons

### 4.3 CLI: Daemon command

**File: `cli/bb_cli/commands/daemon.py` (NEW ~200 lines)**
```python
@app.command()
def daemon(port: int = 9876):
    """Long-running daemon that picks up web-initiated agent requests."""

    # 1. Connect to API via WebSocket
    # 2. Listen for "agent:spawn_request" events
    # 3. On spawn_request:
    #    a. Claim session via POST /claim
    #    b. Determine action from session metadata (suggest/execute/run)
    #    c. Call existing _execute_one() / _suggest_one() etc.
    #    d. Stream output back via WS (not HTTP relay)
    # 4. Heartbeat every 30s
    # 5. Graceful shutdown on SIGINT/SIGTERM
```

**Register in CLI:**
```python
# cli/bb_cli/commands/agent.py (or separate module)
agent_app.add_typer(daemon_app, name="daemon")
```

### 4.4 Web: Spawn UI + approval flow

**File: `web/src/app/projects/[slug]/agent/page.tsx`**
- Add "Run Agent" button that calls `POST /api/agent-sessions/start` with `origin: "web"`
- Show daemon status indicator (connected/disconnected via WS heartbeat)
- When no daemon: show hybrid message with CLI command to copy

**File: `web/src/components/agent/agent-approval-bar.tsx` (NEW ~80 lines)**
- Shows when session.phase === "awaiting_confirmation"
- Displays verify/suggest analysis
- "Approve" and "Reject" buttons
- Reject requires reason text input

**File: `web/src/components/agent/daemon-status.tsx` (NEW ~40 lines)**
- Small indicator showing daemon connection status
- Green dot = connected, gray = disconnected
- Tooltip with daemon info

**File: `web/src/hooks/use-agent-sessions.ts`**
- Add `useApproveAgent(sessionId)` mutation → `POST /approve`
- Add `useRejectAgent(sessionId)` mutation → `POST /reject`

---

## Phase 5: Batch Operations on Web (Future)
**Goal:** Web dashboard for managing multiple parallel agents

_Deferred — build after Phase 1-4 are validated._

---

## Files Changed Summary

### New Files (8)
| File | Lines | Purpose |
|------|-------|---------|
| `cli/bb_cli/streaming.py` | ~150 | AgentStreamer (buffered relay + log) |
| `cli/bb_cli/progress.py` | ~120 | TerminalTracker (Rich Live table) |
| `cli/bb_cli/commands/daemon.py` | ~200 | Daemon command |
| `web/src/hooks/use-agent-stream.ts` | ~80 | WS stream hook |
| `web/src/components/agent/agent-stream-viewer.tsx` | ~180 | Stream viewer |
| `web/src/components/agent/stream-event-list.tsx` | ~150 | Event renderer |
| `web/src/components/agent/agent-approval-bar.tsx` | ~80 | Approve/reject UI |
| `web/src/components/agent/daemon-status.tsx` | ~40 | Daemon status indicator |

### Modified Files (7)
| File | Changes |
|------|---------|
| `api/src/models/agent_session.py` | Add phase, branch_name, worktree_path, claimed_by columns |
| `api/src/schemas/agent_session.py` | Add new fields to response, new request schemas |
| `api/src/routers/agent_sessions.py` | Add relay-batch, phase, claim, approve, reject endpoints |
| `api/src/main.py` | Add /ws/daemon endpoint |
| `cli/bb_cli/commands/agent.py` | Refactor _*_one() to use AgentStreamer + TerminalTracker |
| `web/src/hooks/use-websocket.ts` | Add new event listeners |
| `web/src/hooks/use-agent-sessions.ts` | Add approve/reject mutations |
| `web/src/app/projects/[slug]/agent/page.tsx` | Integrate stream viewer + approval UI |

### New Migration (1)
| File | Changes |
|------|---------|
| `api/alembic/versions/xxx_add_phase_branch_to_agent_sessions.py` | Add phase, branch_name, worktree_path, claimed_by |

---

## Implementation Order

```
Phase 1 (foundation) ──→ Phase 2 (CLI UX) ──→ Phase 3 (Web viewer) ──→ Phase 4 (Daemon)
     │                        │                       │                       │
     │ API migration          │ Rich Live table       │ Stream components     │ Daemon + approval
     │ Batch relay endpoint   │ Tracker protocol      │ WS event hook         │ Bidirectional WS
     │ AgentStreamer class     │ Wire into batch cmds  │ Agent page update     │ Web spawn UI
     │ Refactor _*_one()      │                       │                       │
     └── 2-3 days ──────────→ └── 1 day ────────────→ └── 2 days ──────────→ └── 2-3 days
```

Each phase delivers standalone value and can be shipped independently.
