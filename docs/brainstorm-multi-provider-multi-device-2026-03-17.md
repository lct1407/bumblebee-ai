# Brainstorm: Multi-Provider, Multi-Device, Chatbot Architecture

**Date:** 2026-03-17
**Status:** Draft
**Scope:** Backend API, CLI, Web, Desktop, MCP — comprehensive gap analysis

---

## 1. Problem Statement

Bumblebee currently hardcodes Claude CLI as its sole agent execution engine. All execution happens on the machine running the daemon (CLI or Desktop). The system needs to evolve to support:

- Multiple AI providers (Claude CLI, Gemini CLI, Cursor CLI, OpenCode, Codex, Cline)
- A pool of devices pulling work from a shared queue
- Per-phase provider routing (e.g., Gemini for suggest, Claude for execute)
- A chatbot interface for natural-language task management
- Queue-based distribution replacing polling

---

## 2. Backend (API) — Gaps Identified

### 2.1 Provider Configuration Model (MISSING)

There is no `providers` or `provider_configs` table. The system needs:

**Table: `provider_definitions`** (system-level, seed data)
- id, name, slug (claude-cli, gemini-cli, cursor-cli, opencode, codex, cline)
- executable_name (the binary to invoke)
- supported_phases (JSONB array: which phases this provider can handle)
- default_model (e.g., "claude-sonnet-4-6")
- output_format (stream-json, ndjson, plain-text — different CLIs emit differently)
- requires_api_key (boolean)
- status (active/deprecated)

**Table: `provider_configs`** (per-project or global)
- id, project_id (nullable = global), provider_definition_id
- api_key_ref (reference to secret, NOT the actual key — see 2.9)
- model_override (optional)
- max_concurrent_sessions (per-provider throttle)
- cost_per_input_token, cost_per_output_token (for cost estimation)
- enabled (boolean)
- extra_args (JSONB — provider-specific CLI flags)

**Why this matters:** Without this, you cannot route work to different providers or configure them per-project. The current `AgentSessionCost.model` field is just a string with no backing entity.

### 2.2 Device Registry (MISSING)

There is no `devices` table. The `claimed_by` field on `AgentSession` is just a string (daemon_id). The system needs:

**Table: `devices`**
- id, name, hostname, os, arch
- owner_id (FK to users)
- status (online, offline, busy, draining)
- last_heartbeat (timestamp)
- capabilities (JSONB: available providers, CPU/RAM, GPU, installed CLIs)
- max_concurrent_sessions (int)
- current_load (int — active sessions count)
- tags (JSONB array: "gpu", "fast", "low-cost")
- api_key (unique device auth token — see 2.4)
- created_at, updated_at

**New endpoints needed:**
- `POST /api/devices/register` — device self-registers on daemon start
- `POST /api/devices/{id}/heartbeat` — periodic heartbeat (every 30s)
- `GET /api/devices` — list all devices (admin view)
- `PATCH /api/devices/{id}` — update device capabilities/status
- `DELETE /api/devices/{id}` — deregister device
- `GET /api/devices/{id}/sessions` — list sessions running on a device

### 2.3 Queue System (MAJOR GAP)

The current daemon polls `GET /api/agent-sessions?status=pending` — this is an N+1 problem with multiple devices all polling the same endpoint. The planned PG SKIP LOCKED approach needs:

**Table: `agent_queue`** (dedicated queue table, not overloading agent_sessions)
- id, agent_session_id (FK)
- priority (int: 0=critical, 1=high, 2=normal, 3=low)
- required_provider (nullable — if specified, only devices with this provider can pick it up)
- required_capabilities (JSONB — e.g., {"min_ram_gb": 16})
- enqueued_at (timestamp)
- locked_by_device_id (FK to devices, nullable)
- locked_at (timestamp, nullable)
- attempts (int, default 0)
- max_attempts (int, default 3)
- last_error (text)
- status (queued, locked, completed, dead_letter)

**New endpoints:**
- `POST /api/queue/enqueue` — add session to queue (replaces direct session creation for web-initiated)
- `POST /api/queue/dequeue` — atomic SKIP LOCKED claim (device calls this instead of polling sessions)
- `POST /api/queue/{id}/complete` — mark queue item done
- `POST /api/queue/{id}/fail` — mark failed, increment attempts, re-enqueue or dead-letter
- `GET /api/queue` — view queue state (admin)
- `GET /api/queue/dead-letter` — view failed items

**PG NOTIFY setup:**
- Channel: `agent_queue_ready`
- Payload: `{project_id, priority, required_provider}`
- Daemon subscribes via `LISTEN agent_queue_ready` over a persistent PG connection
- On notification, daemon calls `POST /api/queue/dequeue`

**Critical gap in current claim logic:** `claim_session` in `agent_session_service.py` (line 141-154) is NOT atomic — it reads then writes without row locking. Two daemons calling simultaneously could both read `claimed_by=None` and both proceed. This is a race condition that SKIP LOCKED would solve.

### 2.4 Device Authentication (MISSING)

Currently, devices use user JWT tokens. With a device pool, devices need their own auth:

**Approach:** Device API keys (not JWT)
- On device registration, server generates a unique API key
- Device sends `X-BB-Device-Key: <key>` header
- New auth dependency: `get_current_device()` that validates device key
- Device key scoped to the owner's permissions (inherit from registering user)
- Key rotation endpoint: `POST /api/devices/{id}/rotate-key`

**Why not JWT?** Devices are long-running daemons. JWTs expire. Device API keys are simpler and don't need refresh flows.

### 2.5 Session Handoff / Stale Session Recovery (MISSING)

What happens when a device goes offline mid-execution?

**Current state:** Nothing handles this. The session stays `running` forever with `claimed_by` set.

**Needed:**
- **Heartbeat-based liveness:** If a device misses 3 heartbeats (90s), mark it offline
- **Stale session scanner:** Background task (asyncio periodic) that:
  1. Finds sessions where `status=running` AND device is offline AND `updated_at` > 5 minutes ago
  2. Resets them to `pending` (re-enqueues) or marks `failed` based on retry count
  3. Broadcasts `agent:session_reassigned` WebSocket event
- **Graceful drain:** Device can set status to `draining` — finish current work, don't pick up new
- New endpoint: `POST /api/devices/{id}/drain`

### 2.6 Phase-Provider Routing Config (MISSING)

The plan mentions routing different providers per phase but there is no configuration model:

**Table: `phase_routing_rules`** (per-project)
- id, project_id
- phase (suggest, execute, test, reimplement, verify, merge)
- provider_definition_id (FK)
- model_override (nullable)
- priority (int — for fallback ordering)
- conditions (JSONB — e.g., `{"item_type": "bug", "priority": "critical"}`)

**Simpler alternative (recommended for v1):** Add a `phase_routing` JSONB column on `projects` table:
```json
{
  "suggest": {"provider": "gemini-cli", "model": "gemini-2.5-pro"},
  "execute": {"provider": "claude-cli", "model": "claude-sonnet-4-6"},
  "test": {"provider": "claude-cli"},
  "default": {"provider": "claude-cli"}
}
```
This avoids a new table and keeps it simple (KISS). The separate table is YAGNI for a 1-2 dev team.

### 2.7 Provider on AgentSession (PARTIAL)

`AgentSession` already has `claimed_by` as a string. It needs:
- `provider` column (String(50)) — which provider executed this session
- `device_id` column (FK to devices) — which device ran it (replaces stringly-typed `claimed_by`)
- `model` column (String(100)) — which model was used

`AgentSessionCost` already has `model` but it is NOT linked to `agent_sessions`. The cost should be linked to both work_item AND session.

### 2.8 Retry with Different Provider (MISSING)

If a provider fails, should the system auto-retry with a different one?

**Recommended approach:** Keep it in the queue layer.
- `agent_queue.attempts` tracks retries
- On failure, check `phase_routing_rules` for fallback providers
- Re-enqueue with `required_provider` set to next fallback
- After `max_attempts` exhausted across all providers, move to dead letter

### 2.9 Secrets Management (CRITICAL GAP)

Multiple providers = multiple API keys (Anthropic, Google, OpenAI, etc.). Where do these live?

**Options:**
1. **Environment variables on each device** — Simple but fragile. Each device must be configured separately.
2. **Encrypted in DB** — `provider_configs.api_key_encrypted` with server-side encryption key from env. Devices fetch config from API.
3. **External secrets manager** (Vault, AWS Secrets Manager) — Overkill for 1-2 dev team.

**Recommendation:** Option 2 for v1. Store encrypted API keys in `provider_configs`. Device daemon fetches provider config on startup. Encryption key lives in `api/.env` as `PROVIDER_SECRET_KEY`.

### 2.10 Cost Budgets (MISSING)

No per-project spending limits exist.

**Add to `projects` table:**
- `cost_budget_usd` (float, nullable — null = unlimited)
- `cost_budget_period` (monthly, weekly, total)
- `cost_alert_threshold` (float — alert at 80% of budget)

**New endpoint:** `GET /api/projects/{slug}/cost-summary` — returns total spend by provider, by phase, remaining budget.

**Pre-execution check:** Before dequeuing, verify project hasn't exceeded budget. If exceeded, skip and broadcast `agent:budget_exceeded` event.

### 2.11 Queue Priorities (MISSING)

How to prioritize bugs over features?

**Map work item properties to queue priority:**
- `critical` priority items -> queue priority 0
- `high` priority items -> queue priority 1
- `medium` -> 2
- `low` -> 3
- Type `bug` gets -1 priority boost (e.g., medium bug = priority 1)

This should be configurable per-project via a `priority_rules` JSONB on projects, but the default mapping above covers 90% of cases.

### 2.12 New WebSocket Events Needed

Current events: `agent:spawn_request`, `agent:started`, `agent:message`, `agent:output`, `agent:phase_change`, `agent:completed`, `agent:failed`, `agent:claimed`, `agent:proceed`, `agent:rejected`, `agent:aborted`

**New events needed:**
- `device:registered` — new device joined the pool
- `device:offline` — device went offline (missed heartbeats)
- `device:online` — device came back online
- `device:draining` — device entering drain mode
- `queue:item_enqueued` — new item in queue
- `queue:item_dequeued` — item picked up by device
- `queue:dead_letter` — item exhausted retries
- `agent:session_reassigned` — session moved from offline device to queue
- `agent:provider_fallback` — session retrying with different provider
- `cost:budget_warning` — project approaching budget limit
- `cost:budget_exceeded` — project exceeded budget

### 2.13 Observability / Debugging (MISSING)

Multi-device + multi-provider makes debugging much harder.

**Needed:**
- `agent_session_events` table (or append to existing `work_item_events`):
  - Timestamp, session_id, event_type, device_id, provider, payload
  - Track: enqueued, dequeued, phase_started, phase_completed, error, reassigned
- Structured logging with correlation IDs (session_id in all log lines)
- `/api/agent-sessions/{id}/timeline` endpoint — returns chronological event log
- Provider health check: `/api/providers/{slug}/health` — ping test

---

## 3. Frontend (Web) — Gaps Identified

### 3.1 Device Pool Management (NEW PAGE)

**Route:** `/projects/[slug]/devices` (or global `/devices`)

**Components needed:**
- `DeviceList` — table of registered devices with columns: name, hostname, status, capabilities, active sessions, last heartbeat
- `DeviceStatusBadge` — online (green), offline (red), busy (yellow), draining (orange)
- `DeviceDetailPanel` — Sheet slide-in showing: capabilities, running sessions, history, performance stats
- `DeviceCapabilitiesEditor` — edit tags, max concurrent, available providers

**Real-time updates:** Subscribe to `device:*` WebSocket events to update status badges live.

### 3.2 Provider Configuration (NEW PAGE)

**Route:** `/projects/[slug]/settings/providers` (tab within settings page)

**Components needed:**
- `ProviderConfigList` — list of available providers with enable/disable toggle
- `ProviderConfigForm` — configure API key, model, max concurrent, cost rates
- `PhaseRoutingConfig` — visual grid: rows = phases, columns = provider dropdown + model override
- `ProviderTestButton` — "Test Connection" button that validates API key / CLI availability

### 3.3 Agent Execution Dashboard (ENHANCE EXISTING)

The existing `/projects/[slug]/agent` page shows session list + stream viewer. It needs:

**Enhancements:**
- `DeviceColumn` in agent run list — show which device is executing
- `ProviderBadge` — show which provider (with icon) per session
- `QueueView` — tab showing pending queue items, their priority, required provider
- `DeviceMap` (optional, v2) — visual overview of all devices and their workload
- Live session count by device in a compact dashboard bar

### 3.4 Cost Analytics (NEW PAGE)

**Route:** `/projects/[slug]/analytics/costs`

**Components needed:**
- `CostOverviewCards` — total spend, spend this period, budget remaining, projected spend
- `CostByProviderChart` — bar/pie chart: spend breakdown by provider
- `CostByPhaseChart` — spend by phase (suggest vs execute vs test)
- `CostTimelineChart` — line chart: daily/weekly spend over time
- `CostByItemTable` — sortable table: which work items cost the most
- `BudgetProgressBar` — visual indicator of budget consumption
- `CostAlertBanner` — warning when approaching/exceeding budget

### 3.5 Provider Comparison (ENHANCE ANALYTICS)

**Add to analytics page:**
- `ProviderSuccessRateChart` — success rate by provider per phase
- `ProviderSpeedChart` — average execution time by provider per phase
- `ProviderCostEfficiencyTable` — cost per successful completion by provider

### 3.6 Session Replay (ENHANCE EXISTING)

The existing `AgentStreamViewer` shows live output. For completed sessions:
- `SessionReplayViewer` — paginated view of stored messages from `agent_sessions.messages`
- `SessionTimeline` — horizontal timeline showing phases with duration bars
- `SessionDiffViewer` — show code diff from `agent_sessions.diff`

### 3.7 Missing: Global Admin Dashboard

**Route:** `/dashboard` (enhance existing)

Add cards:
- Active devices (count + status breakdown)
- Queue depth (pending items)
- Running sessions (across all devices)
- Provider health status
- Total spend today/this week

---

## 4. Chatbot / AI Assistant

### 4.1 Where It Lives

**Recommendation: Web UI floating panel (like Intercom/Crisp chat widget)**

Reasons:
- Closest to the data (already has API client, auth, project context)
- Can show rich responses (cards, tables, links to items)
- No additional infrastructure (no Slack bot server)
- Can be opened from any page, context-aware (knows current project, current view)

**NOT recommended for v1:** Slack bot (requires separate infra, OAuth, webhook server), standalone page (loses context)

**Implementation:** Floating button (bottom-right) that opens a slide-up chat panel. Similar to the existing Sheet pattern but anchored to bottom.

### 4.2 What It Can Do

**Tier 1 (v1) — CRUD + Queries:**
- Create items: "create a bug for login crash on mobile"
- Update items: "mark BB-42 as resolved"
- Assign: "assign BB-15 to thanh"
- Query: "how many open bugs?", "what's in the current sprint?", "show blocked items"
- Summarize: "summarize what happened today", "sprint progress?"

**Tier 2 (v2) — Agent Triggers:**
- "fix BB-42 using gemini" -> create session + enqueue with provider=gemini
- "run all open tasks in sprint 3" -> batch enqueue
- "suggest a plan for BB-50" -> trigger suggest phase

**Tier 3 (v3) — Intelligence:**
- "what's blocking the sprint?" -> analyze dependencies + stalled items
- "which provider is best for bug fixes?" -> query cost/success analytics
- "estimate effort for these stories" -> AI-powered estimation

### 4.3 How It Connects

**Backend: New `/api/chat` endpoint**

The chatbot should NOT call MCP tools directly from the frontend. Instead:

```
Web UI Chat Panel
    |
    v
POST /api/chat/message  (sends natural language + project context)
    |
    v
ChatService (server-side)
    |-- Parses intent using lightweight LLM call (Claude Haiku / local model)
    |-- Maps to internal service calls (work_item_service, sprint_service, etc.)
    |-- Returns structured response + optional rich data
    |
    v
JSON response with: message, type (text/card/table/action), data
```

**Why server-side, not client-side?**
- Auth is already handled
- Can call internal services directly (no double-hop through REST)
- Can enforce permissions (user can only see their projects)
- Can cache context (conversation memory per user session)
- Future: can run as MCP tool so Claude Code can also chat

### 4.4 Data Model

**Table: `chat_conversations`**
- id, project_id, user_id
- messages (JSONB array)
- context (JSONB — current filters, current page, etc.)
- created_at, updated_at

**No separate chat_messages table** — conversation is short-lived, JSONB array is fine (KISS).

### 4.5 Technical Approach

**Option A: Direct intent parsing (recommended for v1)**
- Server receives message + project context
- Pattern match common intents (regex + keyword extraction)
- For ambiguous queries, make a single Claude Haiku API call for intent classification
- Map intent to service call
- Return formatted response

**Option B: Full function-calling LLM (v2)**
- Send message to Claude with function definitions matching Bumblebee MCP tools
- Claude returns function calls
- Server executes them
- Returns results

Option A is cheaper, faster, and sufficient for v1. Option B is more flexible but expensive for every chat message.

### 4.6 Conversation Memory

- Store last 20 messages in `chat_conversations.messages`
- Include project stats summary as system context (refreshed every 5 messages)
- No need for vector DB or RAG — the data is structured and queryable

---

## 5. CLI — Gaps Identified

### 5.1 Provider Abstraction (MAJOR)

The current `agent.py` (800+ lines) has `_ClaudeResult` hardcoded and directly invokes `claude` binary. This needs:

**New directory:** `cli/bb_cli/providers/`
- `base.py` — `AgentProvider` protocol/ABC with methods: `run(prompt, cwd, phase) -> ProviderResult`
- `claude.py` — wraps current Claude CLI logic
- `gemini.py` — wraps Gemini CLI (`gemini` binary)
- `cursor.py` — wraps Cursor CLI
- `opencode.py` — wraps OpenCode binary
- `codex.py` — wraps Codex CLI
- `cline.py` — wraps Cline CLI
- `registry.py` — maps provider slug to implementation class

**Key challenge:** Each CLI has different:
- Output format (stream-json vs ndjson vs plain text)
- Permission flags (`--permission-mode bypassPermissions` is Claude-specific)
- Prompt format (some may need different prompt structures)
- Exit code semantics
- Token usage reporting format

**Recommendation:** Start with Claude + Gemini only. Don't build all 6 providers at once (YAGNI). The abstraction layer should exist, but implementations can be added incrementally.

### 5.2 `--provider` Flag

Add to all agent commands:
```
bb agent suggest BB-42 --provider gemini-cli
bb agent execute BB-42 --provider claude-cli --model claude-opus-4-6
bb agent run BB-42 --provider gemini-cli
```

If not specified, check:
1. Project phase routing config (from API)
2. Default provider from project config
3. Global default (claude-cli)

### 5.3 Daemon: NOTIFY Instead of Polling

Current daemon (`daemon.py` line 133-151) uses `time.sleep(poll_interval)` loop. Needs:

**Replace with:**
1. On start, open a persistent asyncio PG connection
2. `LISTEN agent_queue_ready`
3. On notification, call `POST /api/queue/dequeue`
4. Fall back to polling every 30s as safety net (in case NOTIFY is missed)

**Challenge:** The CLI daemon is synchronous (uses `time.sleep`). Converting to asyncio is a significant refactor. Alternatively, use `select.select()` on the PG connection's socket for a blocking-but-efficient wait.

**Desktop daemon** (Rust, `daemon.rs`) already uses tokio async — easier to add PG LISTEN there.

### 5.4 Device Registration on Start

When daemon starts, it should:
1. Call `POST /api/devices/register` with hostname, OS, capabilities
2. Receive device API key (first registration) or validate existing key
3. Start heartbeat background thread (every 30s)
4. On shutdown, send final heartbeat with `status=offline`

Store device key in `~/.bumblebee/device.json`.

### 5.5 Provider Detection

On daemon start, auto-detect available providers:
```python
def detect_providers() -> list[str]:
    providers = []
    if shutil.which("claude"): providers.append("claude-cli")
    if shutil.which("gemini"): providers.append("gemini-cli")
    if shutil.which("cursor"): providers.append("cursor-cli")
    # etc.
    return providers
```

Report these as device capabilities during registration.

---

## 6. Desktop App (Tauri) — Gaps Identified

### 6.1 Provider Management UI

The desktop app currently only has config, project linking, and daemon start/stop. It needs:

- Provider detection panel (show which CLIs are installed)
- Provider install guidance (links/instructions for missing providers)
- Provider config form (API keys — stored locally, NOT sent to server)

### 6.2 Device Registration

Currently the desktop daemon spawns `bb agent <phase>` as subprocess. It should:
- Auto-register as a device on daemon start
- Report capabilities (detected providers, system resources)
- Show device status in the tray icon

### 6.3 Resource Monitoring

Add system tray indicators:
- CPU/RAM usage during agent execution
- Number of active sessions
- Estimated cost of current session

### 6.4 Multi-Provider Process Management

The current `spawn_bb_command` in `daemon.rs` (line 240-300) is tightly coupled to `bb` CLI + Windows `CREATE_NEW_CONSOLE`. For multi-provider:
- Different providers may need different spawn strategies
- Some providers might run in-process (API-based like Codex) vs subprocess (CLI-based like Claude)
- Need a provider registry in Rust matching the Python one

---

## 7. MCP Server — Gaps Identified

### 7.1 Provider-Aware Session Start

The current `bumblebee_agent_sessions` tool's `start` action doesn't accept a provider. It should:
```python
# In start action, accept optional provider field:
fields.get("provider", None)  # -> passed to session creation
```

### 7.2 New MCP Tools Needed

**`bumblebee_devices`** — list devices, check status
- Actions: list, get, status
- Useful for Claude Code to check if devices are available before triggering work

**`bumblebee_queue`** — view/manage queue
- Actions: list, enqueue, cancel
- Useful for Claude Code to enqueue work with specific provider/priority

**`bumblebee_providers`** — list available providers, check health
- Actions: list, health_check

**`bumblebee_costs`** — query cost data
- Actions: summary (by project), detail (by item), budget_status

### 7.3 Agent Run Trigger via MCP

Currently MCP can only start a session. It should be able to trigger full agent runs:
```python
# New action for bumblebee_agent_sessions:
action="run"  # -> enqueue a full run (suggest -> execute -> test -> merge)
# with optional: provider, priority, skip_verify
```

---

## 8. Cross-Cutting Concerns

### 8.1 Configuration Hierarchy

Where does provider config live? Proposed hierarchy (higher overrides lower):

1. **CLI flag** (`--provider claude-cli --model opus`)
2. **Work item custom field** (custom field `preferred_provider` on the item)
3. **Project phase routing** (`projects.phase_routing` JSONB)
4. **Project default provider** (`projects.default_provider`)
5. **System default** (claude-cli, or first available)

### 8.2 Migration Path (Incremental Rollout)

**Phase 1: Foundation (2-3 weeks)**
- Add `provider` + `device_id` columns to `agent_sessions`
- Add `devices` table + registration endpoints
- Add `provider_definitions` seed data table
- CLI: Add provider abstraction layer (base + claude + gemini)
- CLI: Add `--provider` flag to all agent commands
- No breaking changes — existing Claude-only flow still works

**Phase 2: Queue (1-2 weeks)**
- Add `agent_queue` table + endpoints
- PG NOTIFY trigger on insert
- CLI daemon: add PG LISTEN
- Desktop daemon: add PG LISTEN
- Web: queue view tab on agent page

**Phase 3: Multi-Device (1-2 weeks)**
- Device registration + heartbeat
- Device auth (API keys)
- Stale session recovery
- Web: device management page
- Desktop: device registration on start

**Phase 4: Routing + Cost (1-2 weeks)**
- Phase routing config (JSONB on projects)
- Cost budget enforcement
- Web: provider config in settings
- Web: cost analytics page

**Phase 5: Chatbot (2-3 weeks)**
- Chat API endpoint + service
- Web: floating chat panel
- Intent parsing (pattern match + Haiku fallback)
- Rich responses (cards, tables)

### 8.3 Testing Strategy

**Unit tests:**
- Provider abstraction: mock CLI binary, verify output parsing per provider
- Queue: test SKIP LOCKED behavior with concurrent connections
- Router: test phase->provider resolution with different configs

**Integration tests:**
- Device registration + heartbeat + offline detection
- Full queue lifecycle: enqueue -> dequeue -> complete/fail -> retry
- Session handoff: simulate device going offline

**E2E tests:**
- Web: device management page flows
- Web: provider config flows
- Chatbot: basic CRUD commands

### 8.4 Monitoring / Alerting

For a 1-2 dev team, keep it simple:

- **Device offline:** WebSocket event + email/webhook notification
- **Session stalled:** Background task checks every 2 minutes, alerts if session running > 30 min
- **Budget exceeded:** Block new queue items + notification
- **Provider failure rate:** Track per-provider success rate, alert if drops below 50%
- **Queue depth alert:** If queue depth > 20 items for > 10 minutes

Use existing WebSocket broadcast for in-app alerts. Add a `notifications` table for persistent alerts that show as a bell icon in the web nav.

### 8.5 Dead Letter Queue Handling

When a queue item exhausts all retries:
1. Move to `status=dead_letter`
2. Update work item status to `failed`
3. Post a comment on the work item with error details from all attempts
4. Broadcast `queue:dead_letter` WebSocket event
5. Show in web UI under a "Failed" tab in queue view

### 8.6 Graceful Shutdown / Drain

When stopping a device:
1. Set device status to `draining`
2. Finish all active sessions
3. Do NOT pick up new work
4. Once all sessions complete, set status to `offline`
5. Report final heartbeat

---

## 9. Risks and Concerns

### 9.1 Complexity Explosion
Adding 6 providers, multi-device, queue, chatbot simultaneously is dangerous. Each provider will have its own quirks and bugs. **Start with Claude + one alternative (Gemini) and prove the abstraction works.**

### 9.2 Output Format Fragility
Different CLI tools have wildly different output formats. The `_ClaudeResult` pattern of parsing `stream-json` output won't work for all providers. Some may only have plain text output. The provider abstraction must handle this gracefully.

### 9.3 Permission Model Differences
`--permission-mode bypassPermissions` is Claude-specific. Other CLIs may have different permission models, or none at all. Some may require human approval for certain operations. This affects the fully-autonomous execution model.

### 9.4 Prompt Compatibility
The prompts in `cli/bb_cli/templates/` are written for Claude. Other providers may interpret them differently or have different strengths/weaknesses. May need provider-specific prompt variants.

### 9.5 Single Point of Failure
The API server is the single point of failure. If it goes down, all devices stop working. For a 1-2 dev team this is acceptable, but worth noting.

### 9.6 Device Security
Devices running with bypass permissions + access to source code are high-value targets. Device API keys should be rotatable, and device registration should require user approval (not auto-approve).

---

## 10. Summary of Missing Pieces (Priority Ordered)

| Priority | Gap | Layer | Effort |
|----------|-----|-------|--------|
| P0 | Provider abstraction (CLI) | CLI | 1 week |
| P0 | Fix race condition in claim_session | API | 1 day |
| P0 | `provider` + `device_id` on AgentSession | API + DB | 1 day |
| P1 | `devices` table + registration | API + DB | 3 days |
| P1 | `agent_queue` table + SKIP LOCKED | API + DB | 3 days |
| P1 | PG NOTIFY + daemon LISTEN | API + CLI | 2 days |
| P1 | Device heartbeat + stale recovery | API + CLI | 2 days |
| P1 | Device auth (API keys) | API | 2 days |
| P2 | Phase routing config (JSONB on projects) | API + Web | 2 days |
| P2 | Provider config storage + secrets | API + DB | 2 days |
| P2 | Cost budgets + enforcement | API + DB | 2 days |
| P2 | Device management web page | Web | 3 days |
| P2 | Provider config web page | Web | 2 days |
| P2 | Queue view in web | Web | 2 days |
| P2 | New WebSocket events | API | 1 day |
| P3 | Cost analytics web page | Web | 3 days |
| P3 | Provider comparison analytics | Web + API | 2 days |
| P3 | Session replay viewer | Web | 2 days |
| P3 | Desktop device registration | Desktop | 2 days |
| P3 | Desktop provider detection | Desktop | 1 day |
| P3 | MCP new tools (devices, queue, costs) | API/MCP | 2 days |
| P4 | Chatbot: backend service | API | 3 days |
| P4 | Chatbot: web panel | Web | 3 days |
| P4 | Chatbot: intent parsing | API | 3 days |
| P4 | Global admin dashboard | Web | 2 days |
| P4 | Monitoring/alerting | API | 2 days |

**Total estimated effort: ~8-10 weeks for a single developer**, rolled out in 5 phases.

---

## 11. Recommended Approach

1. **Start with the provider abstraction in CLI** — this unblocks everything else and can be tested immediately
2. **Fix the race condition** in session claiming — this is a bug in production
3. **Add device + queue tables** together — they are coupled
4. **Build web UI incrementally** — device page first (most visible), then provider config, then analytics
5. **Chatbot last** — it is a nice-to-have that depends on stable CRUD and agent execution
6. **Desktop follows CLI** — the Rust daemon mirrors the Python daemon, so changes propagate naturally

---

*This analysis is based on reviewing: api/src/models/, api/src/routers/, api/src/services/, api/src/mcp/server.py, api/src/websocket/manager.py, cli/bb_cli/commands/agent.py, cli/bb_cli/commands/daemon.py, desktop/src-tauri/src/daemon.rs, desktop/src-tauri/src/commands.rs, and the web component structure.*
