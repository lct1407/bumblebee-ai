# Phase 03 — WebSocket + Real-time (W3: 2026-06-04 → 06-10)

> **Goal:** Go `/ws` server broadcasting on lifecycle events; client hook with exponential reconnect; debounced cache invalidation; polling fallback.

## Context links
- [plan.md](plan.md) §2.4 Real-time
- [Phase 02](phase-02-core-schema-crud.md) (prereq)
- Research: `../reports/researcher-260513-2210-jarvis-ui-streaming.md` — **THE** reference doc
- Research: `../reports/researcher-260513-2211-bb-web-architecture-analysis.md` — WSManager pattern to port

## Overview
- **Priority:** P0
- **Status:** pending
- **Effort:** 7 days

## Key insights from research (verbatim from reports)

> "Dual-channel architecture (ADOPT): Broadcast → cache invalidation, Session-targeted → AI streaming. Single `/ws` endpoint."
> "gorilla/websocket recommended for Go MVP."
> "Wire format: `{event, data, channel}` JSON."
> "Exponential backoff reconnect 1s → 30s, max 10 retries."
> "Debounced cache invalidation: batch 5 events / 100ms → 1 refetch."
> "REST fallback for stream logs (replay on page refresh)."
> "Polling safety net every 15s if WS drops mid-run."
> "No auth on WebSocket (notification channel only)."

## Requirements

### Functional (server, Go)
1. WS server on `/ws` (same chi mux, not separate port)
2. Two channel kinds: `broadcast` (every client) + `session:{id}` (subscribers only)
3. Subscribe message: `{type: "subscribe", channel: "project:abc"}` or `{type: "subscribe", session: "uuid"}`
4. Server-side hub manages connection registry + per-channel subscription map
5. `broadcast.Publish(channel, event, data)` API for lifecycle hooks
6. Heartbeat: server pings every 30s, drops connections without pong in 45s
7. Graceful shutdown: SIGTERM → drain → close all connections
8. Lifecycle hooks emit events:
   - `work_item:created`, `work_item:updated`, `work_item:deleted`
   - `comment:created`, `comment:updated`, `comment:deleted`
   - `sprint:started`, `sprint:completed`
   - `project:updated`

### Functional (client, Next.js)
1. `WSProvider` mounted in root layout
2. `useWebSocket()` exposes `{connected, send, subscribe(channel, handler)}`
3. Auto-reconnect: exponential backoff (1s, 2s, 4s, 8s, 16s, 30s, capped 10 retries then surface error)
4. Event handler dispatches to TanStack Query: `queryClient.invalidateQueries({queryKey: [...]})`
5. Debouncer: collect events for 100ms, dedupe by key, invalidate in batch
6. Connection indicator in UI top bar (green/yellow/red dot + tooltip)

### Non-functional
- Server handles 500 concurrent connections on staging
- Event publish latency <50ms (publish → client receives)
- Reconnect after server restart: 95% of clients reconnected within 30s
- Zero memory leaks under churning subscriptions (load test required)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Go API (cmd/bb serve)                     │
│                                                             │
│  chi router                                                 │
│   ├─ /api/*  (REST)                                         │
│   └─ /ws     ── WebSocket upgrade                           │
│                  │                                          │
│                  ▼                                          │
│            ┌───────────┐                                    │
│            │  WSHub    │  registry: conn → channels[]       │
│            │           │  subs:     channel → conn[]        │
│            └───────────┘                                    │
│                  ▲                                          │
│                  │ Publish(channel, event, data)            │
│                  │                                          │
│   ┌──────────────┴──────────────┐                           │
│   │     Service layer hooks      │                          │
│   │  (workitems, comments, ...)  │                          │
│   └──────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                     ▲
                     │ WSS (single connection per browser tab)
                     │
┌────────────────────┴───────────────────────┐
│         Next.js client (web)               │
│                                            │
│  WSProvider (root layout)                  │
│    └─ WSManager singleton                  │
│         ├─ connect/reconnect               │
│         ├─ heartbeat                       │
│         ├─ debouncer (100ms / 5 events)    │
│         └─ dispatcher → TanStack Query     │
│             invalidateQueries by keymap    │
└────────────────────────────────────────────┘
```

## Wire format (locked)

### Server → Client
```json
{
  "event": "work_item:updated",
  "data": {
    "id": "uuid",
    "project_id": "uuid",
    "number": 42,
    "status": "in_progress"
  },
  "channel": "project:abc",
  "timestamp": "2026-06-04T10:00:00Z"
}
```

### Client → Server
```json
{ "type": "subscribe",   "channel": "project:abc" }
{ "type": "unsubscribe", "channel": "project:abc" }
{ "type": "subscribe",   "session": "uuid" }            // Phase 07+
{ "type": "pong" }
```

## Event ↔ TanStack Query key map

| Event | Invalidated query keys |
|---|---|
| `work_item:created`/`updated`/`deleted` | `["work-items", projectKey]`, `["work-items", projectKey, id]`, `["work-items-tree", projectKey]` |
| `comment:*` | `["work-item-comments", workItemId]` |
| `sprint:started`/`completed` | `["sprints", projectKey]`, `["work-items", projectKey]` |
| `project:updated` | `["projects"]`, `["project", key]` |

Centralized in `web/lib/ws-keymap.ts` for testability.

## Go server implementation sketch

```go
// internal/ws/hub.go
type Hub struct {
    mu      sync.RWMutex
    conns   map[*Conn]struct{}
    channels map[string]map[*Conn]struct{}   // channel → conns
}

type Conn struct {
    ws       *websocket.Conn
    send     chan []byte
    channels map[string]struct{}
}

func (h *Hub) Publish(channel string, event string, data any) {
    msg := envelope{Event: event, Data: data, Channel: channel, Timestamp: time.Now()}
    payload, _ := json.Marshal(msg)
    h.mu.RLock()
    for conn := range h.channels[channel] {
        select { case conn.send <- payload: default: /* drop slow client */ }
    }
    // Also broadcast to channel="*" subscribers (admin/debug)
    h.mu.RUnlock()
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
    ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
        InsecureSkipVerify: false,
        OriginPatterns:     allowedOrigins,
    })
    if err != nil { return }
    conn := &Conn{ws: ws, send: make(chan []byte, 64), channels: map[string]struct{}{}}
    h.register(conn)
    go conn.writePump()
    conn.readPump(h)
    h.unregister(conn)
}
```

## Client implementation sketch

```ts
// web/lib/ws-manager.ts (~75 LOC, ported from BB v2)
class WSManager {
  private ws: WebSocket | null = null
  private retries = 0
  private subs = new Map<string, Set<Handler>>()
  private debouncer = new Debouncer(100, 5)

  connect() {
    this.ws = new WebSocket(WS_URL)
    this.ws.onopen    = () => { this.retries = 0; this.resubscribe() }
    this.ws.onmessage = (e) => this.dispatch(JSON.parse(e.data))
    this.ws.onclose   = () => this.scheduleReconnect()
  }

  private scheduleReconnect() {
    if (this.retries >= 10) return
    const delay = Math.min(1000 * 2 ** this.retries, 30000)
    this.retries++
    setTimeout(() => this.connect(), delay)
  }

  private dispatch(msg: WSMessage) {
    this.debouncer.add(msg, (batch) => {
      const keysToInvalidate = uniqueKeys(batch.map(mapEventToKeys))
      keysToInvalidate.forEach(key => queryClient.invalidateQueries({queryKey: key}))
    })
  }

  subscribe(channel: string, handler: Handler) { /* ... */ }
  unsubscribe(channel: string) { /* ... */ }
}

export const wsManager = new WSManager()
```

## Implementation steps

### Day 1 — Go hub + accept loop
1. `internal/ws/hub.go` — Hub struct, Register/Unregister/Publish
2. `internal/ws/conn.go` — Conn, readPump/writePump, heartbeat ping/pong
3. Wire `/ws` route in `cmd/bb/serve.go`
4. Smoke test with `websocat`

### Day 2 — Subscribe/unsubscribe semantics
1. Handle client subscribe messages
2. Track channels per conn for clean unsubscribe on disconnect
3. Test: 2 clients subscribe to same channel; publish broadcasts to both

### Day 3 — Service layer hooks
1. Inject `Publish` func into workitems/comments/sprints services
2. After every mutation in service, call `hub.Publish("project:"+projectKey, ...)`
3. Use `defer` with transaction success check — don't publish on rollback
4. Test: PATCH work_item → WS event arrives

### Day 4 — Client WSProvider + WSManager
1. `web/lib/ws-manager.ts` (singleton, port from BB v2 with simplifications)
2. `web/lib/ws-provider.tsx` (mounts WSManager on app load)
3. `web/lib/ws-keymap.ts` (event → query key mapping)
4. Wire into `web/app/layout.tsx`

### Day 5 — Debouncing + TanStack Query integration
1. Debouncer: collect 100ms or 5 events whichever first
2. Dedupe by serialized query key
3. Connection indicator component in top nav

### Day 6 — Polling fallback + reconnect tests
1. Polling: if WS disconnected >5s, switch to 15s polling for visible-page queries
2. Exponential backoff verified with browser DevTools throttling
3. Stress test: 100 simultaneous tabs subscribed; restart server; measure reconnect time

### Day 7 — Load test + observability
1. `wscat` or k6-ws script: 500 concurrent connections, ramp publish to 100 events/s
2. Profile Go server memory under load
3. Metrics: `ws_connections_total`, `ws_events_published_total`, `ws_send_dropped_total`
4. CI green; staging green

## Related files
- New: `internal/ws/hub.go`, `internal/ws/conn.go`, `internal/ws/publisher.go`, `web/lib/ws-manager.ts`, `web/lib/ws-provider.tsx`, `web/lib/ws-keymap.ts`, `web/components/realtime/connection-indicator.tsx`
- Modified: `internal/workitems/service.go`, `internal/comments/service.go`, `internal/sprints/service.go` (publish on mutate), `cmd/bb/serve.go` (mount /ws), `web/app/layout.tsx` (WSProvider)

## Todo list
- [ ] Hub with publish + per-channel subs
- [ ] Conn read/write pumps with heartbeat
- [ ] Service hooks publish on success
- [ ] WSManager singleton with exp backoff
- [ ] Debouncer batches invalidations
- [ ] Connection indicator visible in UI
- [ ] Polling fallback engages on disconnect
- [ ] 500-conn load test passes
- [ ] Reconnect under server restart verified

## Success criteria (DoD)
- Open 2 browser tabs of same project; change status in tab A → tab B Kanban card moves within 200ms
- Server restart on staging → all 100+ test tabs reconnect within 30s
- 500 concurrent connections sustained, memory <200MB

## Risks
- **Risk:** Slow client buffers grow → drop policy (closed channel) may drop legitimate events. Mitigation: log dropped count, scale buffer (64 → 256) before adding backpressure protocol.
- **Risk:** Cross-origin WS blocked in prod → CORS-WS allowlist must include all staging+prod domains.
- **Risk:** Debouncer over-batching causes stale UI (>200ms perceived). Mitigation: tunable, start 50ms.

## Security
- WS does NOT carry sensitive data — only event names + IDs. Sensitive fields fetched via authenticated REST after invalidation.
- Origin allowlist enforced on Upgrade.
- No PII in event payloads (audit each event type day 3).

## Next steps
→ [Phase 04 — Web Shell + Board + Backlog](phase-04-web-shell-board-backlog.md)
