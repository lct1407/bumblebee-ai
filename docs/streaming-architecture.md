# Live Streaming Architecture

How Claude CLI output reaches the browser in real time.

## Data flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (Python)                              │
│                                                                          │
│   POST /api/workflow-runs/trigger                                        │
│        │                                                                  │
│        ▼                                                                  │
│   orchestrator.execute_workflow_run(issue_id)                            │
│        │                                                                  │
│        ▼                                                                  │
│   harness.run_role(session, role)                                        │
│        │                                                                  │
│        ├─→ append_event("session_started")  ──┐                          │
│        │                                       │                          │
│        ▼                                       │                          │
│   provider.invoke_streaming(prompt, on_chunk)  │                          │
│        │                                       │                          │
│        │   ClaudeCLIProvider.invoke_streaming  │                          │
│        │   ┌───────────────────────────────┐  │                          │
│        │   │ subprocess.Popen(             │  │                          │
│        │   │   claude -p                   │  │                          │
│        │   │   --output-format stream-json │  │                          │
│        │   │   --verbose                   │  │                          │
│        │   │ )                             │  │                          │
│        │   │                               │  │                          │
│        │   │ thread reads stdout NDJSON    │  │                          │
│        │   │  → asyncio.Queue              │  │                          │
│        │   │  → parse line, classify type  │  │                          │
│        │   └───────────────┬───────────────┘  │                          │
│        │                   │                   │                          │
│        │                   ▼                   │                          │
│        │           on_chunk({type, ...})       │                          │
│        │                   │                   │                          │
│        │                   ▼                   │                          │
│        │      manager.broadcast(slug, {        │                          │
│        │        type: "llm.chunk",             │                          │
│        │        session_id, issue_id,          │                          │
│        │        payload: {type, text, ...},    │                          │
│        │        seq                            │                          │
│        │      })            │                  │                          │
│        │                    │                  │                          │
│        └──→ append_event ───┤                  │                          │
│             ("llm_call",    │     append_event auto-broadcasts to /ws    │
│              cumulative)    │     via event_log.py:42-76                  │
│                             │                                              │
│                             ▼                                              │
│                  ┌─────────────────────────┐                              │
│                  │  ConnectionManager      │                              │
│                  │  /ws?project=<slug>     │                              │
│                  │  in-memory pubsub       │                              │
│                  └──────┬──────────────────┘                              │
└─────────────────────────┼────────────────────────────────────────────────┘
                          │
                          ▼  WebSocket
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Next.js)                              │
│                                                                          │
│  useEventStream({ project, issueId })                                    │
│        │                                                                  │
│        ├─→ events:   StreamEvent[]   (persisted, dedup by id)            │
│        ├─→ sessions: { [sid]: LiveSession }                              │
│        │              buffer (accumulated text)                          │
│        │              toolUses[], status, tokensIn/Out, costUsd          │
│        └─→ status:   "connecting" | "open" | "closed" | "error"          │
│              │                                                            │
│              ▼                                                            │
│         /issues/[number]  Activity tab                                    │
│              ├─→ <LiveStream sessions status>      ← chunks (live)        │
│              └─→ <ActivityTimeline events>         ← merged poll+push     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Event types on the wire

### `llm.chunk` (ephemeral — NOT persisted to DB)

Broadcast directly from `harness._invoke_with_streaming`. Re-emitted each time the CLI yields a new NDJSON line. Per session, the `seq` field monotonically increases.

| `payload.type` | Trigger | Fields |
|---|---|---|
| `stream_started` | Harness, before provider call | `role` |
| `started` | `system`/`init` line from CLI | `model` |
| `delta` | Token text delta | `text` |
| `tool_use` | Agent calls a tool | `name`, `input` |
| `tool_result` | Tool returned | `output` |
| `completed` | `result` line from CLI | `tokens_in`, `tokens_out`, `cost_usd` |
| `stream_ended` | Harness, after provider call | `role` |
| `error` | Producer thread exception | `message` |

### Persisted events (DB + broadcast)

`append_event` writes to the `events` table AND broadcasts a copy on the WS in one shot (`event_log.py:42-76`). UI dedupes by `id`. Examples: `session_started`, `llm_call` (cumulative totals), `cost_charged`, `session_completed`, `session_failed`.

**Why split?** Tokens deltas would bloat the DB (hundreds per workflow run). Cumulative `llm_call` is enough audit. Live deltas only live in the WS feed → if the UI was closed, you only see the totals.

## Env flags

| Var | Default | Effect |
|---|---|---|
| `BUMBLEBEE_PROVIDER` | `stub` | `claude-cli` to use real CLI |
| `BUMBLEBEE_STREAMING` | `1` | `0` to force single-shot `invoke()` even when provider supports streaming |

## Files

| Path | Role |
|---|---|
| `bumblebee/services/execution/llm_provider.py` | `ClaudeCLIProvider.invoke_streaming` — NDJSON producer thread |
| `bumblebee/services/execution/harness.py` | `_invoke_with_streaming` — wires `on_chunk` → WS broadcast |
| `bumblebee/services/websocket/manager.py` | `ConnectionManager` — pub/sub by `project_slug` |
| `bumblebee/services/state/event_log.py` | `append_event` — DB write + auto-broadcast |
| `bumblebee/routers/websocket.py` | `/ws?project=<slug>` endpoint |
| `web/src/lib/event-stream.ts` | `useEventStream` — WS client, reconnect, session reducer |
| `web/src/components/issues/live-stream.tsx` | `<LiveStream>` UI — per-session card, auto-scroll, tool list |
| `web/src/app/(app)/issues/[number]/page.tsx` | Wires `useEventStream` into the Activity tab |

## Windows asyncio caveat

`asyncio.create_subprocess_exec` is broken on `ProactorEventLoop`, and `asyncpg` is broken on `SelectorEventLoop`. We sidestep both by running the CLI synchronously in a thread (`subprocess.Popen` + `loop.call_soon_threadsafe(queue.put_nowait, line)`). The main loop stays async; the thread does the blocking I/O.

## Backpressure

`asyncio.Queue` is unbounded — fine for normal model speeds (~30 tok/s). If a future provider streams faster than the WS can flush, swap to `Queue(maxsize=...)` and have the producer thread block.

## Reconnect strategy

The frontend hook reconnects every 2s on `onclose`. We don't replay missed chunks (they're ephemeral). On reconnect, the polled `events` query (5s) bridges the gap for *persisted* events. Pure chunk loss between WS gaps is acceptable — totals are in the `llm_call` event.

## Unresolved

- Multi-session interleaving: when several roles run in parallel (Coordinator + N specialists), each emits chunks tagged with its `session_id`. UI currently lists them as separate cards. Reading them sequentially as one transcript would need a "lineage" UI.
- Tool result accumulation: `tool_result` payloads can be large (file contents). We truncate at the UI; backend currently broadcasts the full body. Add server-side truncation when result > 8KB.
- Auth on WS: `/ws` accepts any client without JWT. Phase 8 should require the JWT cookie/header before `mgr.connect`.
