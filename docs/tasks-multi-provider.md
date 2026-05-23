# Multi-Provider + Multi-Device Agent System — Task Breakdown

## Epic: Multi-Provider + Multi-Device Agent System (BB-???)

**Priority:** Critical | **Story Points:** 120 | **Type:** Epic

---

## Parallel Execution Groups

Tasks within the same batch can run in parallel (different file ownership).
Tasks between batches are sequential (dependencies).

---

## Phase 1: Foundation (Week 1-2)

### Batch 1.A — Can run in parallel (API + CLI + DB are independent)

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 1 | Fix claim race condition — SELECT FOR UPDATE SKIP LOCKED | bug | critical | 2 | api | `api/src/services/agent_session_service.py` |
| 2 | AgentProvider protocol + AgentEvent dataclass | task | critical | 3 | cli | `cli/bb_cli/providers/base.py` (new) |
| 3 | DB migration: add provider, device_id, model columns to agent_sessions | task | critical | 2 | api | `api/src/models/agent_session.py`, alembic |
| 4 | DB migration: create provider_definitions seed table | task | high | 2 | api | `api/src/models/provider_definition.py` (new), alembic |
| 5 | DB migration: create devices table | task | high | 3 | api | `api/src/models/device.py` (new), alembic |

### Batch 1.B — Depends on Batch 1.A

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 6 | ClaudeProvider — extract existing _run_claude logic | task | critical | 5 | cli | `cli/bb_cli/providers/claude.py` (new), `cli/bb_cli/commands/agent.py` |
| 7 | GeminiProvider — gemini CLI integration | task | critical | 5 | cli | `cli/bb_cli/providers/gemini.py` (new) |
| 8 | Provider registry + --provider CLI flag | task | high | 3 | cli | `cli/bb_cli/providers/registry.py` (new), `cli/bb_cli/commands/agent.py` |
| 9 | Device registration endpoint POST /api/devices/register | task | high | 3 | api | `api/src/routers/devices.py` (new), `api/src/services/device_service.py` (new) |
| 10 | Device heartbeat endpoint POST /api/devices/{id}/heartbeat | task | high | 2 | api | `api/src/routers/devices.py` |

### Batch 1.C — Depends on Batch 1.B

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 11 | AgentStreamer accepts AgentEvent instead of raw JSON | task | high | 3 | cli | `cli/bb_cli/streaming.py` |
| 12 | Refactor _run_claude → _run_provider in agent.py | task | high | 5 | cli | `cli/bb_cli/commands/agent.py` |
| 13 | Daemon auto-register device + report capabilities on start | task | high | 3 | cli | `cli/bb_cli/commands/daemon.py` |

---

## Phase 2: Queue System (Week 3)

### Batch 2.A — Parallel

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 14 | DB migration: create agent_queue table (priority, attempts, dead_letter) | task | critical | 3 | api | `api/src/models/agent_queue.py` (new), alembic |
| 15 | Queue service: enqueue, dequeue (SKIP LOCKED), complete, fail | task | critical | 5 | api | `api/src/services/queue_service.py` (new) |
| 16 | PG NOTIFY trigger on queue insert | task | high | 2 | api | alembic migration (SQL trigger) |

### Batch 2.B — Depends on 2.A

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 17 | Queue REST endpoints: enqueue, dequeue, list, dead-letter | task | high | 3 | api | `api/src/routers/queue.py` (new) |
| 18 | Daemon subscribe PG NOTIFY (replace polling) | task | high | 5 | cli | `cli/bb_cli/commands/daemon.py` |
| 19 | Dead letter queue handling + work item comment on exhaust | task | medium | 3 | api | `api/src/services/queue_service.py` |
| 20 | Web: queue view tab on agent page | task | medium | 3 | web | `web/src/components/agent/queue-view.tsx` (new) |

---

## Phase 3: Multi-Device (Week 4)

### Batch 3.A — Parallel

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 21 | Device auth: generate API key on register, X-BB-Device-Key auth | task | high | 3 | api | `api/src/auth/device.py`, `api/src/routers/devices.py` |
| 22 | Stale session recovery: background scanner + re-enqueue | task | high | 3 | api | `api/src/services/agent_session_service.py`, background task |
| 23 | Device offline detection: no heartbeat >60s → mark offline | task | high | 2 | api | `api/src/services/device_service.py` |
| 24 | Router logic: pick best device (least busy, has provider, has repo) | task | high | 5 | api | `api/src/services/device_service.py` |

### Batch 3.B — Depends on 3.A

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 25 | Graceful drain mode: POST /api/devices/{id}/drain | task | medium | 2 | api | `api/src/routers/devices.py` |
| 26 | New WebSocket events: device:*, queue:*, agent:reassigned | task | medium | 3 | api | `api/src/websocket/manager.py` |
| 27 | Web: device pool management page | task | medium | 5 | web | `web/src/app/projects/[slug]/devices/` (new) |
| 28 | Desktop: auto-register device + provider detection on daemon start | task | medium | 3 | desktop | `desktop/src-tauri/src/daemon.rs` |

---

## Phase 4: Routing + Cost (Week 5-6)

### Batch 4.A — Parallel

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 29 | Phase routing config: JSONB column on projects table | task | high | 3 | api | `api/src/models/project.py`, alembic, `api/src/services/` |
| 30 | Secrets management: encrypted provider API keys in DB | task | high | 3 | api | `api/src/models/provider_config.py` (new), encryption utils |
| 31 | Cost budget: per-project spending limit + enforcement | task | high | 3 | api | `api/src/models/project.py`, `api/src/services/cost_service.py` (new) |
| 32 | Cost tracking per provider: pricing table + session cost calc | task | medium | 3 | api | `api/src/services/cost_service.py` |

### Batch 4.B — Depends on 4.A

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 33 | Web: provider config page in project settings | task | medium | 5 | web | `web/src/app/projects/[slug]/settings/providers/` (new) |
| 34 | Web: cost analytics page (spend by provider/phase/item) | task | medium | 5 | web | `web/src/app/projects/[slug]/analytics/` (new) |
| 35 | MCP: new tools — bumblebee_devices, bumblebee_queue, bumblebee_costs | task | medium | 3 | api | `api/src/mcp/server.py` |
| 36 | Provider health check endpoint + CLI detection | task | low | 2 | api+cli | `api/src/routers/providers.py` (new) |

---

## Phase 5: Chatbot (Week 7-9)

### Batch 5.A — Parallel

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 37 | Chat API: POST /api/chat/message endpoint + ChatService | task | high | 5 | api | `api/src/routers/chat.py` (new), `api/src/services/chat_service.py` (new) |
| 38 | DB migration: chat_conversations table | task | high | 2 | api | `api/src/models/chat_conversation.py` (new), alembic |
| 39 | Intent parser: pattern match + Claude Haiku fallback | task | high | 5 | api | `api/src/services/chat_intent.py` (new) |

### Batch 5.B — Depends on 5.A

| # | Title | Type | Priority | SP | Owner | Files |
|---|-------|------|----------|----|-------|-------|
| 40 | Web: floating chat panel component | task | high | 5 | web | `web/src/components/chat/chat-panel.tsx` (new) |
| 41 | Chat: CRUD actions (create/update/query items, sprint status) | task | high | 5 | api | `api/src/services/chat_service.py` |
| 42 | Chat: agent trigger commands ("fix BB-42 using gemini") | task | medium | 3 | api | `api/src/services/chat_service.py` |
| 43 | Chat: rich responses (item cards, tables, action buttons) | task | medium | 3 | web | `web/src/components/chat/` |
| 44 | Global admin dashboard: devices, queue, sessions, spend | task | medium | 5 | web | `web/src/app/dashboard/` |

---

## Parallel Execution Summary

```
Week 1:  [1,2,3,4,5] parallel → [6,7,8,9,10] parallel → [11,12,13] parallel
Week 3:  [14,15,16] parallel → [17,18,19,20] parallel
Week 4:  [21,22,23,24] parallel → [25,26,27,28] parallel
Week 5-6: [29,30,31,32] parallel → [33,34,35,36] parallel
Week 7-9: [37,38,39] parallel → [40,41,42,43,44] parallel

Max parallelism per batch: 5 tasks (api + cli + web + desktop + mcp)
```

## Provider Compatibility Matrix

| Provider | Headless cmd | JSON output | Permission bypass | MCP support |
|---|---|---|---|---|
| Claude CLI | `claude -p` | `--output-format stream-json` | `--permission-mode bypassPermissions` | `--mcp-config` |
| Gemini CLI | `gemini -p` | `--output-format streaming-json` | `--yolo` | Built-in |
| Cursor CLI | `cursor-agent -p` | `--output-format stream-json` | (auto in headless) | Unknown |
| OpenCode | `opencode -p` | `-f json` | (auto in non-interactive) | Unknown |
| Codex CLI | `codex exec` | `--json` | `--full-auto` | MCP server |
| Cline CLI | `cline "prompt"` | `--json` | `-y` | Built-in |
