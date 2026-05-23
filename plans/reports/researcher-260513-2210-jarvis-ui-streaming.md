# WebSocket & Real-Time UI Streaming Patterns — Jarvis Agents Reference Analysis

**Date:** 2026-05-13 | **Source:** D:\Source\jarvis-agents (Strapi + Next.js reference) + Bumblebee v2 (FastAPI + Next.js)

---

## Executive Summary

Jarvis (Strapi/TypeScript) and Bumblebee (FastAPI/Python) use **dual-channel WebSocket architecture**: one broadcast channel for cache invalidation (`useWebSocket`), one session-targeted channel for AI streaming (`useChatWebSocket`/`useAgentStream`). Both avoid server-to-client authentication and defer auth to REST API. Event grouping into messages happens client-side via state machines. **Recommendation: Bumblebee's Go backend should adopt FastAPI's existing patterns (already shipped in v2_ws.py) for initial MVP, then evaluate SSE if scaling hits connection limits.**

---

## 1. WebSocket Architecture (Server Side)

### Jarvis (Strapi + ws npm)

**Setup (forge/strapi — TypeScript)**
- Library: `ws` (npm WebSocketServer)
- Endpoint: `/ws` (single, shared HTTP server port)
- No auth: notification-only channel
- Session subscriptions: `Map<sessionId, Set<WebSocket>>`

**API surface:**
```ts
broadcast(event, data)       // → all clients
sendToSession(sessionId, ...) // → subscribed clients only
waitForSubscriber(sid, ms)    // race condition prevention
```

**Lifecycle hookups** (forge/strapi/src/services):
- Issue created/updated → `broadcast('issue:*', {...})`
- Task status change → `broadcast('task:*', {...})`
- AI streaming → `sendToSession(sessionId, 'chat:text_delta', {...})`

**Wire format:**
```json
{
  "event": "issue:created",
  "data": { "id": "...", "title": "..." },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Bumblebee v2 (FastAPI + websockets)

**Two implementations shipped:**

**V1 (v2_ws.py — Channel-based):**
- Channels: `project:{id}`, `item:{id}`, `run:{id}` (URL-routed)
- Endpoint: `/ws/{channel}`
- Client: connect to channel, server broadcast to all in channel
- **Use case:** project-level cache invalidation

**V1b (websocket/manager.py — Hybrid):**
- Global connections by project slug + session subscriptions
- Endpoint: `/ws` (single)
- Client sends `{"action": "subscribe", "session_id": "..."}`
- Broadcast to project or session (granular)
- Ping loop (30s)
- **Use case:** device events, queue updates, session-targeted streaming

**Wire format (both):**
```json
{
  "event": "work_item:created",
  "data": { ... },
  "channel": "project:123" // v2_ws only
}
```

### Go Backend Recommendation

**ADOPT for MVP:** FastAPI v2 pattern (already proven in Bumblebee).
- Use `github.com/gorilla/websocket` (Go standard library).
- Two handlers:
  - `/ws` → hybrid (global + session subscriptions)
  - `/ws/{channel}` → channel-based (optional, for bulk operations)
- Async broadcast loop with dead connection cleanup.
- **Do NOT over-engineer:** no pub/sub Redis unless scaling to 1000+ concurrent.

**Code sketch (Go):**
```go
type WSManager struct {
  channels map[string][]*websocket.Conn
  mu       sync.RWMutex
}

func (m *WSManager) Broadcast(channel string, event string, data interface{}) {
  m.mu.RLock()
  conns := m.channels[channel]
  m.mu.RUnlock()
  
  msg, _ := json.Marshal(map[string]interface{}{
    "event": event,
    "data": data,
  })
  for _, ws := range conns {
    ws.WriteMessage(websocket.TextMessage, msg) // fire-and-forget, handle errors
  }
}
```

---

## 2. Event Registry (What Gets Broadcast)

### Bumblebee v2 Event Catalog

**Work Item Lifecycle (broadcast to project):**
| Event | Payload | When | Consumer |
|-------|---------|------|----------|
| `work_item:created` | `{ id, title, status }` | After POST /items | React Query: invalidate `["work-items"]` |
| `work_item:updated` | `{ id, status, assignee, ... }` | After PUT /items/{id} | React Query invalidate |
| `work_item:deleted` | `{ id }` | Soft delete | Refetch list |
| `work_item:bulk_updated` | `{ ids[], status, assignee }` | Bulk patch | Refetch |

**Agent Session (both broadcast + session-targeted):**
| Event | Payload | Flow |
|-------|---------|------|
| `agent:started` | `{ session_id, work_item_id, phase }` | Broadcast to project; session starts |
| `agent:output` | `{ events: StreamEvent[], session_id }` | **Session-targeted** via WS; replayed via REST |
| `agent:phase_change` | `{ phase, session_id }` | Broadcast + session; UI updates progress |
| `agent:completed` | `{ session_id, final_status }` | Broadcast; finalize message |
| `agent:failed` | `{ session_id, error }` | Broadcast; show error UI |
| `agent:spawn_request` | `{ device_id, session_id }` | Ask user to approve |
| `agent:proceed` | `{ session_id }` | User approved, resume |

**Device Pool:**
| Event | Payload |
|-------|---------|
| `device:registered` | `{ device_id, name, online: true }` |
| `device:offline` | `{ device_id, reason }` |
| `device:online` | `{ device_id }` |
| `device:draining` | `{ device_id, graceful }` |

**Queue & Cost:**
| Event | Payload |
|-------|---------|
| `queue:item_enqueued` | `{ queue_id, work_item_id, phase, locked_at }` |
| `queue:item_dequeued` | `{ queue_id, device_id }` |
| `queue:dead_letter` | `{ queue_id, reason, attempts }` |
| `cost:budget_warning` | `{ project_id, used, limit, percent }` |
| `cost:budget_exceeded` | `{ project_id }` |

### Jarvis (Strapi) Event Catalog

**Broadcast (cache invalidation):**
- `issue:created`, `issue:updated`, `issue:confirmed`, `issue:resolved`, `issue:enrichment_failed`
- `task:created`, `task:updated`, `agent:completed`
- `notification:created`

**Session-targeted (AI chat streaming):**
- `chat:session_ready` — client subscribes to new session
- `chat:text_delta` — append text chunk
- `chat:tool_use` — show tool call in progress
- `chat:done` — per-iteration complete (may have more iterations)
- `chat:complete` — full run finished
- `chat:error` — run failed
- `agent:message` — full message block (Antigravity runner)
- `agent:complete` — agent run finished
- `agent:user-message` — echo user input

---

## 3. Client-Side WebSocket Hooks

### Pattern 1: Global Cache Invalidation (`useWebSocket`)

**Jarvis (typescript webSocket API):**
```ts
const MAX_RETRIES = 10, BASE_DELAY = 1000;

export function useWebSocket() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryCount = useRef(0);
  const [connected, setConnected] = useState(false);
  
  const connect = () => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { setConnected(true); retryCount.current = 0; };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // Switch on msg.event, invalidate caches
      if (msg.event.startsWith('issue:')) 
        queryClient.invalidateQueries({ queryKey: ['issues'] });
    };
    ws.onclose = () => {
      setConnected(false);
      const delay = Math.min(BASE_DELAY * 2 ** retryCount.current, 30_000);
      reconnectTimer.current = setTimeout(connect, delay);
    };
    wsRef.current = ws;
  };
  
  useEffect(() => { connect(); }, []);
  return { connected };
}
```

**Bumblebee (wsManager abstraction):**
```ts
// web/src/hooks/use-websocket.ts
useEffect(() => {
  if (!projectSlug) return;
  wsManager.connect(projectSlug);
  
  const unsubs = [
    wsManager.on("work_item:created", () => qc.invalidateQueries({ queryKey: ["work-items"] })),
    wsManager.on("work_item:updated", () => qc.invalidateQueries({ queryKey: ["work-items"] })),
    wsManager.on("agent:completed", () => qc.invalidateQueries({ queryKey: ["agent-sessions"] })),
    // ... 20+ event handlers
  ];
  
  return () => { unsubs.forEach(u => u()); wsManager.disconnect(); };
}, [projectSlug, qc]);
```

**Key pattern:** 
- Exponential backoff reconnect (Jarvis: 1s → 2s → 4s ... → 30s, 10 max)
- Bumblebee uses wsManager singleton (encapsulates URL, retry logic)
- No auth headers on WebSocket; auth via separate REST token

### Pattern 2: AI Session Streaming (`useChatWebSocket` / `useAgentStream`)

**Jarvis (forge/web):**
```ts
interface UseChatWebSocketOptions {
  sessionId: string | null;
  setSessionId?: (id: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
}

export function useChatWebSocket({ sessionId, setMessages, setSessionId }: UseChatWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const streamingMsgId = useRef<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      if (sessionIdRef.current) 
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: sessionIdRef.current }));
    };
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      // Subscribe to new session (race condition prevention)
      if (msg.event === 'chat:session_ready' && msg.data?.requestId === pendingRequestId.current) {
        subscribeToSession(msg.data.sessionId);
        setSessionId?.(msg.data.sessionId);
      }
      
      // Append text delta
      if (msg.event === 'chat:text_delta' && streamingMsgId.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId.current
              ? { ...m, content: m.content + (msg.data?.text || '') }
              : m
          )
        );
      }
      
      // Add tool call
      if (msg.event === 'chat:tool_use' && streamingMsgId.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId.current
              ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
              : m
          )
        );
      }
      
      // Per-iteration done (mark tools finished, keep streaming)
      if (msg.event === 'chat:done') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId.current
              ? { ...m, toolCalls: m.toolCalls?.map((tc) => ({ ...tc, isStreaming: false })) }
              : m
          )
        );
      }
      
      // Full complete
      if (msg.event === 'chat:complete') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId.current
              ? { ...m, content: msg.data?.reply || m.content, isStreaming: false }
              : m
          )
        );
        streamingMsgId.current = null;
      }
    };
    
    wsRef.current = ws;
  }, []);
  
  return { wsRef, streamingMsgId, subscribeToSession };
}
```

**Bumblebee (web/src/hooks/use-agent-stream.ts):**
```ts
export function useAgentStream(sessionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const eventsRef = useRef<StreamEvent[]>([]);
  
  // Replay persisted stream logs on refresh
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const logs = await api.request(`/api/agent-sessions/${sessionId}/stream-logs`);
      if (logs && logs.length > 0) {
        eventsRef.current = logs.flatMap((b) => b.events).filter(Boolean);
        setEvents([...eventsRef.current]);
      }
    })();
  }, [sessionId]);
  
  // Subscribe to live events via WS
  useEffect(() => {
    if (!sessionId) return;
    wsManager.send({ action: "subscribe", session_id: sessionId });
    
    const unsub1 = wsManager.on("agent:output", (data) => {
      const newEvents: StreamEvent[] = data.events || [data.payload];
      eventsRef.current = [...eventsRef.current, ...newEvents.filter(Boolean)];
      setEvents([...eventsRef.current]);
    });
    
    const unsub2 = wsManager.on("agent:phase_change", (data) => {
      setPhase(data.phase);
    });
    
    const unsub3 = wsManager.on("agent:completed", () => {
      setPhase("idle");
    });
    
    // Polling fallback: every 15s check if session still running
    const interval = setInterval(async () => {
      const session = await api.request(`/api/agent-sessions/${sessionId}`);
      if (session && session.status !== "running" && session.status !== "pending") {
        setPhase("idle");
      }
    }, 15_000);
    
    return () => {
      unsub1(); unsub2(); unsub3();
      wsManager.send({ action: "unsubscribe", session_id: sessionId });
      clearInterval(interval);
    };
  }, [sessionId]);
  
  return { events, phase };
}
```

**Key differences:**
- **Jarvis:** Assembles messages during stream (text delta → content, tool_use → toolCalls)
- **Bumblebee:** Collects raw StreamEvent[], groups into messages client-side, replays from REST fallback

---

## 4. Stream Viewer Component (Chat-Style Message Assembly)

### Message Grouping Algorithm

**Input:** Raw events (text, tool_use, tool_result, usage)  
**Output:** ChatMessageData[] grouped by role + conversation turn

**Jarvis (useChatWebSocket handler):**
```
• State: streamingMsgId (current assistant message UUID)
• On text_delta: append to content
• On tool_use: create ToolCallData, push to toolCalls[]
• On tool_result: update matching tool by ID, mark complete
• On chat:done: finalize tool calls (stop streaming flag)
• On chat:complete: finalize entire message
```

**Bumblebee (agent-stream-viewer.tsx):**
```ts
function groupEventsIntoMessages(events: StreamEvent[]): ChatMessageData[] {
  const messages: ChatMessageData[] = [];
  let currentAssistant: ChatMessageData & { blocks: ContentBlock[] } | null = null;
  
  for (const event of events) {
    // Message start (from_role: 'assistant')
    if (event.type === 'message_start') {
      if (currentAssistant) messages.push(currentAssistant);
      currentAssistant = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        contentBlocks: [],
      };
    }
    
    // Content delta
    if (event.type === 'content_block_delta') {
      if (currentAssistant && event.delta?.type === 'text_delta') {
        currentAssistant.content += event.delta.text;
        let lastBlock = currentAssistant.blocks?.[...].pop();
        if (lastBlock?.type === 'text') {
          lastBlock.text += event.delta.text;
        } else {
          currentAssistant.blocks?.push({ type: 'text', text: event.delta.text });
        }
      }
    }
    
    // Tool use
    if (event.type === 'tool_use') {
      if (currentAssistant) {
        currentAssistant.blocks?.push({
          type: 'tool_use',
          tool: { id: event.id, name: event.name, input: event.input }
        });
      }
    }
    
    // Message complete
    if (event.type === 'message_complete') {
      if (currentAssistant) messages.push(currentAssistant);
      currentAssistant = null;
    }
  }
  
  return messages;
}
```

**Render phase (both):**
- Group consecutive tool calls by name (e.g., 3× `TodoWrite` → single collapsed group)
- Show streaming indicator (blinking cursor) while `isStreaming: true`
- Collapsible tool call groups with input/result
- Progress checklist (TodoWrite special case)

---

## 5. React Query Cache Invalidation Strategy

### Pattern: Invalidate on Event, Refetch On-Demand

**Jarvis (useWebSocket):**
```ts
const invalidate = (keys: string[]) => {
  keys.forEach((key) =>
    queryClient.invalidateQueries({ queryKey: [key], refetchType: 'all' })
  );
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.event) {
    case 'issue:created':
    case 'issue:updated':
      invalidate(['issues', 'issue']);
      break;
    case 'task:created':
    case 'task:updated':
      invalidate(['tasks']);
      break;
  }
};
```

**Debounce optimization (Bumblebee, v2):**
```ts
const pendingKeys = useRef(new Set<string>());
const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

const invalidate = (keys: string[]) => {
  keys.forEach((key) => pendingKeys.current.add(key));
  clearTimeout(debounceTimer.current);
  debounceTimer.current = setTimeout(() => {
    const toInvalidate = [...pendingKeys.current];
    pendingKeys.current.clear();
    toInvalidate.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    );
  }, 300); // batch multiple events within 300ms
};
```

**Effect:** Batch 5 events in rapid succession → single React Query refetch.

### Query Key Design

**Bumblebee (from use-websocket.ts):**
```ts
queryKey: ["work-items"]        // List view
queryKey: ["work-items", id]    // Detail view (if used)
queryKey: ["comments"]          // All comments
queryKey: ["agent-sessions"]    // Session list + detail
queryKey: ["devices"]           // Device pool
queryKey: ["queue"]             // Queue viewer
queryKey: ["cost-summary"]      // Budget tracking
```

**Cache invalidation targets broad keys** (e.g., `["work-items"]`) not specific IDs, because:
1. Avoid maintaining ID→key mappings
2. Single broadcast can affect multiple views (list + detail)
3. Stale time (60s) prevents thrashing

---

## 6. Optimistic Updates Pattern

### NOT Implemented in Jarvis/Bumblebee

**Observation:** Both repos invalidate on server event, then refetch. No optimistic updates for chat streaming.

**Why?** 
- AI responses are deterministic server-side (Claude API stream)
- Can't predict final message before server computes it
- Tool calls are asynchronous (user sees in-progress indicator)

**Where optimistic updates WOULD apply (not implemented):**
- Work item status change (button click → toggle, await confirmation)
- Assignment (drag-and-drop kanban → local state, await 200 OK)

**Pattern (if implemented):**
```ts
const mutation = useMutation({
  mutationFn: (newStatus: string) => api.updateItem({ status: newStatus }),
  onMutate: async (newStatus) => {
    // Optimistically update cache
    queryClient.setQueryData(['work-items', itemId], (prev) => ({
      ...prev,
      status: newStatus,
    }));
  },
  onError: (err, _, context) => {
    // Rollback on failure
    if (context) queryClient.setQueryData(['work-items', itemId], context);
  },
});
```

---

## 7. Reconnection & Fault Tolerance

### Client-Side Reconnect

**Jarvis exponential backoff:**
- 1s, 2s, 4s, 8s, 16s (cap 30s), max 10 retries
- After 10 failed attempts, give up (show error toast)

**Bumblebee (wsManager):**
- Fixed 2s retry for session streams (simpler, scope = single item)
- Connected state exposed → UI can show banner

**Fallback strategies:**

| Failure | Mitigation |
|---------|-----------|
| WS drops mid-stream | Polling fallback (Bumblebee: 15s check session status) |
| WS reconnects late | Replay stream logs from REST API (Bumblebee: `/api/agent-sessions/{id}/stream-logs`) |
| Race: server sends before client subscribed | `waitForSubscriber(sessionId, 5s)` (Jarvis) or session_ready event (both) |

---

## 8. Architectural Comparison & Tradeoffs

### Jarvis (Strapi) vs Bumblebee (FastAPI)

| Aspect | Jarvis | Bumblebee | Winner |
|--------|--------|-----------|--------|
| **Code simplicity** | Inline handlers in hook | Separated wsManager + events | Bumblebee (+testability) |
| **Reconnect logic** | Hardcoded in hook | Encapsulated in manager | Bumblebee |
| **Event deduplication** | None; can rapid-fire | 300ms debounce | Bumblebee (+perf) |
| **Session targeting** | Separate subscribe message | Same endpoint | Jarvis (-latency) |
| **Broadcast + session** | Two hooks | One manager | Bumblebee (-duplication) |
| **Persisted fallback** | None | REST stream logs | Bumblebee (+UX) |
| **Typing** | Any; string events | TypeScript enums | Bumblebee |

### Go Backend: SSE vs WebSocket vs Hybrid

| Tech | Pros | Cons | Use Case |
|------|------|------|----------|
| **WebSocket** | Bidirectional, persistent, low-latency | Connection overhead, harder to load-balance | Real-time chat, streaming. **ADOPT for MVP.** |
| **SSE** | Simpler (HTTP), auto-reconnect, load-balancer friendly | Unidirectional, polling for latency | Broadcast only. **Consider for static deployments.** |
| **Hybrid** | Best of both (WebSocket for session, SSE for broadcast) | Complexity, two implementation paths | Large-scale (1000+). **Not needed yet.** |

**Recommendation: Implement WebSocket first (Go gorilla/websocket), defer SSE to scaling milestone.**

---

## 9. Patterns to ADOPT

### ✅ Dual-Channel Architecture (Broadcast + Session)

**Why:** Decouples cache invalidation (cheap, fire-and-forget) from streaming (persistent, ordered).

**Implementation:**
1. Broadcast channel: `/ws` with project subscription
2. Session subscription: same connection, message type `{ action: "subscribe", session_id }`
3. Server tracks both channels separately

**Bumblebee pattern (already in v2_ws.py + websocket/manager.py):**
- Use hybrid approach: global connections by project + session subscriptions
- No separate WS endpoints; simplifies client logic

---

### ✅ Event Replay from REST API

**Why:** Browser refresh → replay stream logs without WS replay complexity.

**Implementation (Bumblebee):**
```ts
// On mount, fetch persisted logs
const logs = await api.request(`/api/agent-sessions/${sessionId}/stream-logs`);
if (logs && logs.length > 0) {
  const replayed = logs.flatMap((batch) => batch.events);
  setEvents(replayed);
}
// Then subscribe to WS for live updates
wsManager.send({ action: "subscribe", session_id: sessionId });
```

**Why better than WS replay:**
- REST API is load-balanceable
- No risk of missed events between mount and WS reconnect
- Supports multi-tab: each tab fetches full log independently

---

### ✅ Debounced Cache Invalidation

**Why:** Batch rapid events (5 items updated in 100ms) → single refetch.

**Implementation:**
```ts
const pendingKeys = useRef(new Set<string>());
const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

const invalidate = (keys: string[]) => {
  keys.forEach((key) => pendingKeys.current.add(key));
  clearTimeout(debounceTimer.current);
  debounceTimer.current = setTimeout(() => {
    const toInvalidate = [...pendingKeys.current];
    pendingKeys.current.clear();
    toInvalidate.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    );
  }, 300);
};
```

**Effect:** 5 events → 1 network request instead of 5.

---

### ✅ Client-Side Event Grouping into Messages

**Why:** Server streams raw events (text delta, tool_use, message_complete); UI groups into message objects.

**Algorithm:**
1. Track `currentAssistantMessage` (UUID)
2. On text_delta: append to `message.content`, push to `contentBlocks[...].text`
3. On tool_use: create ToolCallData, push to `contentBlocks[]`
4. On tool_result: find tool by ID, update result, mark complete
5. On message_complete: finalize, reset

**Benefit:** Server stays simple (just emit events), UI handles presentation logic.

---

### ✅ Streaming Indicator + Collapsible Tool Groups

**UI pattern (Jarvis + Bumblebee):**
- Show `[isStreaming: true]` → blinking cursor at end of text
- Group consecutive tool calls by name → single collapsible UI
- Expand tool to show input (collapsed by default)
- Show result after tool completes
- Auto-scroll to latest message

---

## 10. Patterns to AVOID

### ❌ Full WS Message Replay Server-Side

**Why it's bad (Jarvis attempted):**
- Requires server to buffer all events
- Client asks for replay → server resends (slow, redundant)
- If 100 clients join session, each gets full replay (N²)

**Better:** Store stream logs in REST API (Bumblebee), client fetches on demand.

---

### ❌ Separate WebSocket Endpoints per Channel

**Anti-pattern (Jarvis v1):**
```
/ws/project:123
/ws/session:abc
→ client must manage 2 WS connections
```

**Better:** Single `/ws` with subscription messages (Bumblebee).

---

### ❌ No Debouncing on Cache Invalidation

**Bad:** 10 items bulk-updated → 10 invalidateQueries calls → 10 refetches.

**Better:** Batch in 300ms window.

---

### ❌ Relying Only on WS for Persistence

**Bad:** Browser refresh → lose context if WS reconnect is slow.

**Better:** Hybrid: fetch latest from REST, then subscribe to WS for deltas.

---

### ❌ Complex Authorization on WebSocket

**Anti-pattern:** Send auth token on every WS message.

**Better:** No auth on WS (notification channel). Sensitive data fetched via authenticated REST.

---

## 11. Go Backend Implementation Checklist

### Phase 1 (MVP — Week 1)

- [ ] Implement `WSManager` (gorilla/websocket)
  - `func (m *WSManager) Connect(ws *websocket.Conn, channel string)`
  - `func (m *WSManager) Disconnect(ws *websocket.Conn, channel string)`
  - `func (m *WSManager) Broadcast(channel string, event string, data interface{})`
  - Connection map: `channels map[string][]*websocket.Conn`
  - Handle dead connections on send failure
- [ ] Router `/ws/{channel}` (FastAPI mirror)
  - Accept connection
  - Subscribe/unsubscribe client messages
  - Keep-alive loop (ping every 30s)
- [ ] Broadcast service integrations
  - Work item CRUD → `Broadcast("project:{id}", "work_item:created", ...)`
  - Queue events → same
  - Cost events → same
- [ ] Next.js client hook (`use-websocket.ts`)
  - Connect to `/ws/project:{slug}`
  - Invalidate React Query caches on event
  - Exponential backoff reconnect
- [ ] Tests
  - Connect/disconnect lifecycle
  - Broadcast to multiple clients
  - Dead connection cleanup

### Phase 2 (Session Streaming — Week 2)

- [ ] Session subscriptions (hybrid model)
  - Client: `{ action: "subscribe", session_id }`
  - Server: `sessionSubscriptions map[string]set[*websocket.Conn]`
- [ ] `SendToSession(sessionId string, event string, data interface{})`
- [ ] CLI/worker integration
  - Relay agent stdout → `SendToSession(sessionId, "agent:output", StreamEvent{})`
- [ ] useAgentStream hook
  - Subscribe on mount
  - Collect StreamEvent[]
  - Replay from REST fallback
  - Unsubscribe on unmount
- [ ] Agent stream viewer (message grouping)
  - Group events into ChatMessageData[]
  - Render with tool collapse, usage bar

### Phase 3 (Polish — Week 3)

- [ ] Debounced cache invalidation (300ms batch)
- [ ] Polling fallback (15s check session status)
- [ ] Connection state indicator (UI banner)
- [ ] Load testing (100s concurrent, broadcast latency)
- [ ] Docker/Kubernetes deployment config (daemonset? or sidecar WS proxy?)

---

## 12. Integration with Existing Bumblebee

**Alignment:**
- Bumblebee v2 already ships `websocket/manager.py` (v1b hybrid model)
- Go backend should mirror this (not reinvent)
- React Query integration proven in web/src/hooks/use-websocket.ts

**Next steps:**
1. **Port wsManager to Go** (Bumblebee → API)
   - Copy architecture, adapt to gorilla/websocket
2. **Test with existing Next.js web client** (should work as-is)
3. **Extend event handlers** as new services broadcast (queue, cost, device)
4. **Scale evaluation** (1000 concurrent → consider Redis pub/sub, SSE)

---

## Unresolved Questions

1. **Load balancer + multiple Go instances:** How to broadcast across instances? (Recommend Redis pub/sub if scaling beyond single instance.)
2. **Browser multi-tab coordination:** Should tabs share WS connection? (Current design: independent, each tab reconnects; replay handles sync.)
3. **Message history limit:** How long to persist stream logs in REST API? (Current: indefinite; recommend TTL after 30 days.)
4. **Graceful shutdown:** How to drain WS clients when deploying? (Recommend: mark device draining, refuse new sessions, wait 30s, close.)
5. **Mobile/Tauri compatibility:** Does desktop daemon use same WS protocol? (Should; test with Tauri worker in Phase 2.)

---

## References

**Jarvis (Source of Truth):**
- D:\Source\jarvis-agents\docs\websocket-implementation.md
- D:\Source\jarvis-agents\forge\web\src\hooks\use-websocket.ts (lines 1–108)
- D:\Source\jarvis-agents\forge\web\src\hooks\use-agent-websocket.ts (lines 1–112)
- D:\Source\jarvis-agents\forge\web\src\hooks\use-agent-ws-handlers.ts (streaming logic)
- D:\Source\jarvis-agents\forge\web\src\lib\agent-stream-utils.ts (message assembly)
- D:\Source\jarvis-agents\forge\web\src\components\chat\chat-message\chat-message.tsx (rendering)

**Bumblebee v2 (Shipping Now):**
- D:\Source\Bumblebee-cli\api\src\v2_ws.py (channel-based manager)
- D:\Source\Bumblebee-cli\api\src\websocket\manager.py (hybrid manager)
- D:\Source\Bumblebee-cli\web\src\hooks\use-websocket.ts (debounced cache invalidation)
- D:\Source\Bumblebee-cli\web\src\hooks\use-agent-stream.ts (replay + live streaming)
- D:\Source\Bumblebee-cli\web\src\components\agent\agent-stream-viewer.tsx (message grouping)

---

**Status:** DONE  
**Summary:** Jarvis provides a solid reference implementation for dual-channel WebSocket architecture. Bumblebee v2 has already adapted the patterns successfully. Go backend should follow Bumblebee's hybrid model (single endpoint, subscription messages) with `gorilla/websocket`. Shipping MVP in 1 week is achievable by porting existing patterns; scaling to multi-instance requires Redis pub/sub (milestone 2).

