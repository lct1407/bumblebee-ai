# WebSocket Implementation

## Overview

Dual-purpose WebSocket system:
1. **Broadcast** — push data-change events to ALL project clients for cache invalidation
2. **Session-targeted** — stream agent events to subscribed clients only

Single endpoint at `/ws?project={slug}`. No auth on WS — notification channel only.

## Architecture

```
                    Client A (browser)              Client B (browser)
                        |                               |
                 useWebSocket()                  useAgentStream()
                (broadcast listener)           (session subscriber)
                        |                               |
                        +----------- WSS ---------------+
                                      |
                                /ws endpoint
                              ConnectionManager
                                      |
                      +---------------+----------------+
                      |               |                |
                broadcast()    send_to_session()  wait_for_subscriber()
                      |               |                |
              REST routes        Relay endpoints   Pre-stream sync
              (work item,       (agent streaming)
               comment, device)
```

## Server Side

### Tech Stack
- FastAPI native WebSocket support
- `ConnectionManager` singleton at `api/src/websocket/manager.py`
- Project-scoped connections + session-scoped subscriptions

### ConnectionManager

```python
@dataclass
class ConnectionManager:
    _connections: dict[str, list[WebSocket]]           # project_slug → ws[]
    _session_subscriptions: dict[str, set[WebSocket]]  # session_id → ws set
```

### Server API Functions

#### `broadcast(event, data, project_slug)`
Send to ALL clients connected to a project. Used for data-change notifications.

```python
await ws_manager.broadcast("work_item:updated", {"id": 42, "status": "done"}, project_slug="my-project")
```

#### `send_to_session(session_id, event, data)`
Send only to clients subscribed to a specific agent session. Used for streaming.

```python
await ws_manager.send_to_session("sess-123", "agent:output", {"payload": {...}})
```

#### `wait_for_subscriber(session_id, timeout_ms=5000)`
Async poll until at least one client subscribes. Prevents race conditions where server starts streaming before client connects.

```python
has_subscriber = await ws_manager.wait_for_subscriber("sess-123", timeout_ms=5000)
if has_subscriber:
    await ws_manager.send_to_session("sess-123", "agent:output", data)
```

#### `handle_client_message(ws, raw_text)`
Parse incoming JSON messages from clients:

```python
# Client sends: {"type": "subscribe", "session_id": "sess-123"}
# Client sends: {"type": "unsubscribe", "session_id": "sess-123"}
```

### Wire Format

All messages are JSON:

```json
{
  "event": "work_item:updated",
  "data": { "id": 42, "status": "done", "number": 15 }
}
```

### WebSocket Endpoint

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, project: str | None = None):
    await ws_manager.connect(websocket, project)
    try:
        while True:
            raw = await websocket.receive_text()
            await ws_manager.handle_client_message(websocket, raw)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, project)
```

### Ping/Pong Health Check

Background task pings all connections every 30s. Dead connections cleaned up automatically.

## Client Side (React/Next.js)

### Tech Stack
- `WSManager` singleton at `web/src/lib/websocket.ts`
- Event bus pattern: `wsManager.on(event, handler)` returns unsubscribe function
- `@tanstack/react-query` for cache invalidation

### WS URL Configuration

```ts
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const wsUrl = apiUrl.replace("http", "ws") + "/ws?project=" + slug;
```

### WSManager Class

```ts
class WSManager {
  connect(projectSlug?: string)        // Connect to WS endpoint
  disconnect()                          // Clean close
  on(event: string, handler): () => void  // Subscribe to events
  send(data: Record<string, unknown>)   // Send JSON message to server
}
```

**Reconnect strategy:** Exponential backoff — 1s, 2s, 4s, ... up to 30s cap, max 10 retries. Reset on successful connection.

### Hook 1: `useWebSocket(projectSlug)` — Global Cache Invalidation

Connects once at project layout level. Listens for broadcast events, invalidates React Query caches.

```ts
// Events → queryKey invalidation
"work_item:created"    → ["work-items"]
"work_item:updated"    → ["work-items"]
"work_item:deleted"    → ["work-items"]
"work_item:bulk_updated" → ["work-items"]
"comment:created"      → ["comments"]
"agent:started"        → ["agent-sessions"]
"agent:completed"      → ["agent-sessions"]
"agent:failed"         → ["agent-sessions"]
"agent:phase_change"   → ["agent-sessions"]
"device:registered"    → ["devices"]
"device:offline"       → ["devices"]
"queue:item_enqueued"  → ["queue"]
"queue:item_dequeued"  → ["queue"]
"cost:budget_warning"  → ["cost-summary"]
```

### Hook 2: `useAgentStream(sessionId)` — Agent Session Streaming

Subscribes to a session channel. Accumulates stream events for the agent viewer.

```ts
// On mount: wsManager.send({ type: "subscribe", session_id: sessionId })
// On cleanup: wsManager.send({ type: "unsubscribe", session_id: sessionId })

// Listens for:
"agent:output"       → accumulate StreamEvent[]
"agent:phase_change" → update phase state
"agent:completed"    → set phase to "idle"
"agent:failed"       → set phase to "idle"
```

**Polling fallback:** 15s interval checks session status via REST API. Catches completion if WS drops mid-stream.

```ts
useEffect(() => {
  if (!sessionId || phase === "idle") return;
  const interval = setInterval(async () => {
    const session = await fetch(`/api/agent-sessions/${sessionId}`);
    if (session.status !== "running") setPhase("idle");
  }, 15_000);
  return () => clearInterval(interval);
}, [sessionId, phase]);
```

## Event Catalog

### Broadcast Events (all project clients)

| Event | Trigger | Data |
|-------|---------|------|
| `work_item:created` | Item created | `{ id, number, title, type }` |
| `work_item:updated` | Item updated / status sync | `{ id, number, status }` |
| `work_item:deleted` | Soft delete | `{ id, number }` |
| `work_item:bulk_updated` | Bulk action | `{ ids[], count }` |
| `comment:created` | New comment | `{ id, work_item_id, author }` |
| `agent:spawn_request` | Session start (web) | `{ session_id, work_item_id }` |
| `agent:started` | Session start (cli) | `{ session_id, work_item_id }` |
| `agent:completed` | Session complete | `{ session_id }` |
| `agent:failed` | Session failed | `{ session_id }` |
| `agent:claimed` | Daemon claim | `{ session_id, daemon_id }` |
| `device:registered` | Device registered | device data |
| `device:offline` | Device heartbeat timeout | device data |
| `device:online` | Device reconnected | device data |
| `device:draining` | Device draining | device data |
| `queue:item_enqueued` | Item queued | queue data |
| `queue:item_dequeued` | Item dequeued | queue data |
| `queue:dead_letter` | Max attempts reached | queue data |
| `cost:budget_warning` | Budget threshold hit | cost data |
| `cost:budget_exceeded` | Budget exceeded | cost data |

### Session Events (subscribed clients only)

| Event | Data | Purpose |
|-------|------|---------|
| `agent:output` | `{ session_id, payload }` or `{ session_id, events[] }` | Stream event (single or batch) |
| `agent:phase_change` | `{ session_id, phase }` | Phase transition |
| `agent:message` | `{ session_id, role, message }` | User/assistant message |
| `agent:proceed` | `{ session_id, phase: "execute" }` | User approval |
| `agent:rejected` | `{ session_id, reason }` | User rejection |
| `agent:aborted` | `{ session_id }` | Session aborted |

## Key Design Decisions

1. **Project-scoped connections** — clients connect per project slug, reducing noise from other projects
2. **Session-targeted channels** — server-side `send_to_session()` replaces client-side filtering; scales with concurrent agents
3. **`wait_for_subscriber()`** — prevents race condition where relay starts before UI connects
4. **React Query integration** — WS events trigger `invalidateQueries()` not manual state updates; API remains source of truth
5. **Exponential backoff** — 1s→30s cap, 10 max retries; resets on successful reconnect
6. **Polling fallback** — 15s safety net catches completion if WS drops mid-stream
7. **No auth on WS** — notification channel only; sensitive data fetched via authenticated REST
8. **Ping/pong health** — server pings every 30s, cleans dead connections automatically

## Relay Endpoints

Agent streaming uses relay endpoints to pipe CLI output through the API to WebSocket clients:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/agent-sessions/{id}/relay` | Single event relay |
| `POST /api/agent-sessions/{id}/relay-batch` | Batched events relay |

CLI/desktop daemon → relay endpoint → `send_to_session()` → subscribed browser clients.
