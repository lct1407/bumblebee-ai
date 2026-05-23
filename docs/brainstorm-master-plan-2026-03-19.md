# Master Plan: Multi-Provider Agent Infrastructure

**Date:** 2026-03-19
**Status:** Brainstorm Complete
**Scope:** Complete the multi-provider, multi-device agent infrastructure so that web-initiated agent sessions flow end-to-end through the queue to daemon workers.

---

## Problem Statement

The individual pieces of the multi-provider agent system exist (Device model, Queue service, Agent sessions, Provider abstraction, Daemon, Web UI pages) but they are **not wired together**. The critical dispatch path -- user clicks "Run" in web UI -> session created -> enqueued -> daemon dequeues -> executes -> reports back -- has several broken links. Additionally, the daemon lacks production-grade features (idempotent registration, PID file, worker pool, multi-project support, graceful shutdown).

## Architecture Overview

```
Web UI "Run" click
  -> POST /api/agent-sessions/start (origin=web, status=pending)
  -> dispatch_service.dispatch() [NEW - GAP #1]
     -> queue_service.enqueue()
     -> WS broadcast "queue:item_enqueued"

Daemon (bb daemon start)
  -> Registers device (idempotent via device_uid) [GAP #5]
  -> PID file prevents duplicates [GAP #6]
  -> Polls POST /api/queue/dequeue [GAP #3 - currently polls sessions directly]
  -> ThreadPoolExecutor runs sessions concurrently [GAP #7]
  -> On phase change -> API auto-syncs work_item status [GAP #2]
  -> On complete -> queue_service.complete() + device load decrement
  -> Graceful shutdown: drain -> wait -> offline [GAP #9]
```

---

## Epics and Stories

### EPIC 1: End-to-End Dispatch Pipeline (P0)

**Goal:** Make the web "Run" button actually trigger agent execution on a daemon.

#### Story 1.1: Dispatch Service (API)
Connect `start_session()` to `enqueue()` so web-originated sessions enter the queue.

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 1.1.1 | Create dispatch_service.py with dispatch() function | api | `api/src/services/dispatch_service.py` | - | 2 | Takes session_id, resolves project_id, calls queue_service.enqueue(), broadcasts WS event |
| 1.1.2 | Wire dispatch into start_session endpoint | api | `api/src/routers/agent_sessions.py` | 1.1.1 | 1 | After start_session(), if origin=="web", call dispatch_service.dispatch() |
| 1.1.3 | Add dispatch tests | api | `api/tests/test_dispatch_service.py` | 1.1.1 | 2 | Unit tests for dispatch logic, edge cases (no device, already queued) |

#### Story 1.2: Daemon Uses Queue (CLI)
Daemon should poll `/api/queue/dequeue` instead of filtering sessions directly.

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 1.2.1 | Replace _poll_pending_sessions with _dequeue_from_queue | cli | `cli/bb_cli/commands/daemon.py` | - | 3 | POST /api/queue/dequeue with device_id + available_providers. On success, resolve session from queue item |
| 1.2.2 | Add queue completion reporting to daemon | cli | `cli/bb_cli/commands/daemon.py` | 1.2.1 | 2 | After session finishes, POST /api/queue/{id}/complete or /fail. Also call device load decrement |
| 1.2.3 | Remove legacy claim_session polling path | cli | `cli/bb_cli/commands/daemon.py` | 1.2.1, 1.2.2 | 1 | Clean up _poll_pending_sessions, _claim_session functions |

#### Story 1.3: Phase-to-Status Auto-Sync (API)
When agent phase changes, automatically update the linked work_item status.

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 1.3.1 | Add phase_status_map and sync logic to agent_session_service | api | `api/src/services/agent_session_service.py` | - | 2 | Map: execute->in_progress, test->in_review, merge->resolved, failed->failed. Call in update_phase() |
| 1.3.2 | Skip lifecycle evidence gates for auto-sync transitions | api | `api/src/services/lifecycle_service.py` | 1.3.1 | 1 | Add enforce_evidence=False when called from phase auto-sync |
| 1.3.3 | Broadcast work_item status change on auto-sync | api | `api/src/services/agent_session_service.py` | 1.3.1 | 1 | WS event "work_item:updated" so web UI refreshes |

---

### EPIC 2: Production-Grade Daemon (P0)

**Goal:** Make the daemon reliable, restartable, and capable of concurrent execution.

#### Story 2.1: Idempotent Device Registration (CLI + API)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 2.1.1 | Generate and persist device_uid in ~/.bumblebee/device_id | cli | `cli/bb_cli/commands/daemon.py` | - | 1 | UUID4, create once on first daemon start, reuse forever |
| 2.1.2 | Add device_uid column to Device model | api | `api/src/models/device.py`, new migration | - | 1 | String(50), unique, nullable (backward compat) |
| 2.1.3 | Add register_or_update endpoint using device_uid | api | `api/src/services/device_service.py`, `api/src/routers/devices.py` | 2.1.2 | 2 | If device_uid exists, update capabilities+heartbeat. If not, create new. Return existing device_id |
| 2.1.4 | Update daemon registration to send device_uid | cli | `cli/bb_cli/commands/daemon.py` | 2.1.1, 2.1.3 | 1 | POST with device_uid, store returned device_key in ~/.bumblebee/device_key |

#### Story 2.2: PID File and Duplicate Prevention (CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 2.2.1 | Add PID file management to daemon start/stop | cli | `cli/bb_cli/commands/daemon.py` | - | 2 | Write PID to ~/.bumblebee/daemon.pid on start. Check for stale PID on start. Clean up on shutdown |

#### Story 2.3: Worker Pool for Concurrent Execution (CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 2.3.1 | Add ThreadPoolExecutor to daemon main loop | cli | `cli/bb_cli/commands/daemon.py` | 1.2.1 | 3 | max_workers from config (default 2). Submit _run_session to executor. Track active futures |
| 2.3.2 | Dequeue multiple items when capacity available | cli | `cli/bb_cli/commands/daemon.py` | 2.3.1 | 2 | Check executor capacity (max_concurrent - active_count). Dequeue up to that many items per poll cycle |

#### Story 2.4: Multi-Project Daemon (CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 2.4.1 | Load all projects from config.toml | cli | `cli/bb_cli/commands/daemon.py`, `cli/bb_cli/config.py` | - | 2 | Read [projects.*] sections. Each has slug + path. Daemon serves all of them |
| 2.4.2 | Resolve project path from queue item | cli | `cli/bb_cli/commands/daemon.py` | 2.4.1, 1.2.1 | 2 | Queue dequeue returns project_id. Need API call to get project slug, then local config lookup for path |

#### Story 2.5: Graceful Shutdown and Crash Recovery (CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 2.5.1 | Implement drain-wait-offline shutdown sequence | cli | `cli/bb_cli/commands/daemon.py` | 2.3.1 | 2 | SIGTERM/SIGINT -> set draining -> wait for executor to finish -> mark device offline -> remove PID file |
| 2.5.2 | Orphaned session cleanup on daemon start | cli | `cli/bb_cli/commands/daemon.py` | 2.1.4 | 2 | On start, query API for running sessions claimed by this device_uid, re-enqueue them |

#### Story 2.6: Daemon Management Commands (CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 2.6.1 | Add bb daemon stop command | cli | `cli/bb_cli/commands/daemon.py` | 2.2.1 | 1 | Read PID from daemon.pid, send SIGTERM |
| 2.6.2 | Add bb daemon status command | cli | `cli/bb_cli/commands/daemon.py` | 2.2.1 | 1 | Read PID, check if process alive, show device info from API |
| 2.6.3 | Add bb daemon logs command (placeholder) | cli | `cli/bb_cli/commands/daemon.py` | - | 1 | Tail ~/.bumblebee/daemon.log (future: structured logging to file) |

---

### EPIC 3: Device Authentication and Security (P1)

**Goal:** Validate device API keys on requests and propagate provider credentials securely.

#### Story 3.1: Device Auth Middleware (API)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 3.1.1 | Create device auth dependency (X-BB-Device-Key header) | api | `api/src/dependencies.py` | - | 2 | get_current_device() dependency. Look up device by api_key_hash. Return Device or 401 |
| 3.1.2 | Apply device auth to queue dequeue endpoint | api | `api/src/routers/queue.py` | 3.1.1 | 1 | Dequeue requires valid device key. Auto-populate device_id from authenticated device |
| 3.1.3 | Apply device auth to heartbeat endpoint | api | `api/src/routers/devices.py` | 3.1.1 | 1 | Heartbeat only works with matching device key |
| 3.1.4 | Update daemon to send device key in API requests | cli | `cli/bb_cli/commands/daemon.py`, `cli/bb_cli/api_client.py` | 2.1.4, 3.1.1 | 2 | Load device_key from ~/.bumblebee/device_key, set as X-BB-Device-Key header |

#### Story 3.2: Credential Propagation (API + CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 3.2.1 | Add provider credential endpoint (GET /api/provider-configs/{slug}/credentials) | api | `api/src/routers/provider_configs.py` (new) | 3.1.1 | 2 | Returns decrypted API key for the provider. Requires device auth. Uses secrets_service |
| 3.2.2 | Daemon fetches provider credentials before execution | cli | `cli/bb_cli/commands/daemon.py` | 3.2.1 | 2 | Before running session, GET credentials for required_provider. Set as env var for subprocess |

---

### EPIC 4: Session Reliability (P1)

**Goal:** Detect stuck sessions, handle timeouts, and provide retry mechanisms.

#### Story 4.1: Session Timeout Detection (API)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 4.1.1 | Add session timeout background job | api | `api/src/background.py` | - | 2 | Check running sessions older than 45 min with no relay in 10 min. Mark failed, re-enqueue |
| 4.1.2 | Add last_activity_at column to AgentSession | api | `api/src/models/agent_session.py`, new migration | - | 1 | Updated on every relay_output. Used by timeout checker |
| 4.1.3 | Update relay_output to touch last_activity_at | api | `api/src/services/agent_session_service.py` | 4.1.2 | 1 | Set last_activity_at = now() on each relay |

#### Story 4.2: Enhanced Device Model (API)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 4.2.1 | Add environment detection fields to Device model | api | `api/src/models/device.py`, new migration | - | 1 | shell_type, environment (native/wsl/docker/ssh), machine_group, version columns |
| 4.2.2 | Send environment info during device registration | cli | `cli/bb_cli/commands/daemon.py` | 4.2.1 | 1 | Auto-detect WSL vs native, shell type, send in register request |

---

### EPIC 5: ProxyProvider Support (P1)

**Goal:** Enable proxy-based providers (Antigravity, custom endpoints) through a generic ProxyProvider.

#### Story 5.1: ProxyProvider Implementation (CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 5.1.1 | Create ProxyProvider class | cli | `cli/bb_cli/providers/proxy.py` | - | 3 | Extends AgentProvider. Runs Claude CLI with custom ANTHROPIC_BASE_URL. Configurable via extra_args |
| 5.1.2 | Register ProxyProvider in registry | cli | `cli/bb_cli/providers/registry.py` | 5.1.1 | 1 | Add "proxy" to _PROVIDER_MAP. Support dynamic registration from provider_configs |
| 5.1.3 | Add type + proxy_url columns to ProviderConfig | api | `api/src/models/provider_config.py`, new migration | - | 1 | type: "direct"|"proxy". proxy_url for proxy-based providers |

---

### EPIC 6: Web UI Completion (P1)

**Goal:** Complete the web experience for triggering and monitoring agent sessions.

#### Story 6.1: Agent Start Flow (Web)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 6.1.1 | Add inline "Run Agent" button to work item row | web | `web/src/components/work-items/shared/work-item-row.tsx` | - | 2 | Button visible on hover. Calls agent start API |
| 6.1.2 | Create device/provider selector dialog | web | `web/src/components/agent/agent-start-dialog.tsx` (new) | - | 3 | Modal: pick provider (from enabled configs), pick target device (optional), pick phase. Calls POST /api/agent-sessions/start |
| 6.1.3 | Wire AgentActionsBar to use start dialog | web | `web/src/components/agent/agent-actions-bar.tsx` | 6.1.2 | 1 | Replace direct API call with dialog flow |

#### Story 6.2: Navigation and Layout (Web)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 6.2.1 | Add Devices and Queue links to project sidebar | web | `web/src/components/layout/sidebar.tsx` | - | 1 | Under "Agent" section: Devices, Queue, Runs links |
| 6.2.2 | Add live pipeline progress indicator | web | `web/src/components/agent/pipeline-progress.tsx` (new) | - | 2 | Shows current phase as step indicator (verify->execute->test->merge). Subscribe to WS agent:phase_change |

#### Story 6.3: Queue Management UI (Web)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 6.3.1 | Add manual retry button to dead letter items | web | `web/src/features/queue/components/queue-view.tsx` | - | 2 | Button calls POST /api/queue/{id}/retry (need new endpoint) |
| 6.3.2 | Add queue retry endpoint | api | `api/src/routers/queue.py`, `api/src/services/queue_service.py` | - | 1 | Reset dead_letter item to queued, reset attempts to 0 |

---

### EPIC 7: CLI Device Commands (P2)

**Goal:** Provide CLI commands for device management.

#### Story 7.1: Device CLI Commands

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 7.1.1 | Add bb device list/show commands | cli | `cli/bb_cli/commands/device.py` (new) | - | 2 | List all devices, show single device details. Uses api_get |
| 7.1.2 | Add bb device remove command | cli | `cli/bb_cli/commands/device.py` | 7.1.1 | 1 | Delete device by id. Calls DELETE /api/devices/{id} |
| 7.1.3 | Add DELETE endpoint for devices | api | `api/src/routers/devices.py`, `api/src/services/device_service.py` | - | 1 | Soft-delete or hard-delete a device |
| 7.1.4 | Register device commands in main CLI | cli | `cli/bb_cli/main.py` | 7.1.1 | 1 | Add device_app to main typer app |

---

### EPIC 8: Cost Tracking Integration (P2)

**Goal:** Record costs from agent sessions and display in web UI.

#### Story 8.1: Cost Recording (API + CLI)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 8.1.1 | Record session cost on completion | api | `api/src/services/agent_session_service.py`, `api/src/services/cost_service.py` | - | 2 | In complete_session(), extract token_usage from summary, call cost_service.record() |
| 8.1.2 | Add record_cost function to cost_service | api | `api/src/services/cost_service.py` | - | 1 | Create AgentSessionCost row with model, tokens, estimated cost |
| 8.1.3 | Send token_usage in daemon session completion | cli | `cli/bb_cli/commands/daemon.py` | - | 1 | ProviderResult.token_usage -> POST complete with summary containing token data |

#### Story 8.2: Cost Dashboard (Web)

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 8.2.1 | Create cost summary page | web | `web/src/app/projects/[slug]/costs/page.tsx` (new) | 8.1.1 | 3 | Charts: total cost, cost by model, cost by phase. Uses GET /api/projects/{slug}/agent-costs |
| 8.2.2 | Add cost link to sidebar | web | `web/src/components/layout/sidebar.tsx` | 8.2.1 | 1 | Under Agent section |

---

### EPIC 9: MCP Tools Extension (P2)

**Goal:** Expose devices and queue via MCP tools for Claude Code integration.

#### Story 9.1: MCP Device and Queue Tools

| # | Task | Package | Key Files | Depends | SP | Notes |
|---|------|---------|-----------|---------|----|----|
| 9.1.1 | Add bumblebee_devices MCP tool | api | `api/src/mcp/tools.py` or equivalent | - | 2 | list/get/drain devices via MCP |
| 9.1.2 | Add bumblebee_queue MCP tool | api | `api/src/mcp/tools.py` | - | 2 | list/retry/cancel queue items via MCP |

---

## Sprint Plan

### Sprint 1: Critical Path (Week 1-2)
**Goal:** Web "Run" -> Queue -> Daemon -> Execute works end-to-end.

**Parallel Group A (API - no file conflicts):**
- 1.1.1 Dispatch service (new file)
- 1.3.1 Phase-status auto-sync (agent_session_service.py)
- 2.1.2 Device model device_uid column (models/device.py + migration)

**Parallel Group B (CLI - no file conflicts):**
- 2.1.1 Device_uid persistence (daemon.py)
- 2.2.1 PID file management (daemon.py) -- *conflicts with 2.1.1, sequence after*

**Sequential (depends on Group A):**
- 1.1.2 Wire dispatch into start_session (agent_sessions.py router) -- after 1.1.1
- 1.3.2 Skip evidence gates for auto-sync (lifecycle_service.py) -- after 1.3.1
- 1.3.3 Broadcast WS on auto-sync (agent_session_service.py) -- after 1.3.1
- 2.1.3 Register-or-update endpoint (device_service.py + devices.py router) -- after 2.1.2

**Sequential (depends on both groups):**
- 2.1.4 Update daemon registration (daemon.py) -- after 2.1.1, 2.1.3
- 1.2.1 Daemon uses queue (daemon.py) -- after 2.1.4
- 1.2.2 Queue completion reporting (daemon.py) -- after 1.2.1
- 1.2.3 Remove legacy polling (daemon.py) -- after 1.2.2

**Done criteria:** Start an agent session from web UI -> daemon picks it up from queue -> executes -> work item status updates automatically.

### Sprint 2: Reliability (Week 2-3)
**Goal:** Daemon is production-ready with concurrent execution, crash recovery, graceful shutdown.

**Parallel Group A (daemon.py - sequential within group):**
- 2.3.1 Worker pool (ThreadPoolExecutor)
- 2.3.2 Multi-dequeue based on capacity -- after 2.3.1
- 2.5.1 Graceful shutdown -- after 2.3.1
- 2.5.2 Orphaned session cleanup -- after 2.1.4

**Parallel Group B (daemon.py - management commands):**
- 2.6.1 bb daemon stop
- 2.6.2 bb daemon status
- 2.6.3 bb daemon logs

**Parallel Group C (API - independent):**
- 4.1.2 Add last_activity_at column (model + migration)
- 4.1.3 Update relay_output (agent_session_service.py) -- after 4.1.2
- 4.1.1 Session timeout background job (background.py) -- after 4.1.2
- 4.2.1 Environment detection fields (device model + migration)

**Parallel Group D (CLI - independent):**
- 4.2.2 Send environment info (daemon.py) -- after 4.2.1
- 2.4.1 Multi-project config loading (daemon.py + config.py)
- 2.4.2 Resolve project path from queue (daemon.py) -- after 2.4.1

**Note:** Groups A and B both touch daemon.py. Group B is additive (new subcommands) and can be done in parallel with care. Group A is sequential modifications to the start command.

**Done criteria:** Daemon can run 2 concurrent sessions, survives restart, cleans up orphans, multi-project, graceful shutdown works.

### Sprint 3: Security and Providers (Week 3-4)
**Goal:** Device authentication enforced, credentials propagated, proxy provider available.

**Parallel Group A (API auth):**
- 3.1.1 Device auth dependency (dependencies.py)
- 3.1.2 Apply to queue dequeue (queue.py) -- after 3.1.1
- 3.1.3 Apply to heartbeat (devices.py) -- after 3.1.1

**Parallel Group B (CLI auth):**
- 3.1.4 Daemon sends device key (daemon.py + api_client.py) -- after 3.1.1
- 3.2.2 Daemon fetches credentials (daemon.py) -- after 3.2.1

**Parallel Group C (API credentials):**
- 3.2.1 Provider credential endpoint (new router file)

**Parallel Group D (Proxy provider):**
- 5.1.3 Add type/proxy_url to ProviderConfig (model + migration)
- 5.1.1 ProxyProvider class (new file: providers/proxy.py)
- 5.1.2 Register ProxyProvider (registry.py) -- after 5.1.1

**Done criteria:** Device auth enforced on all daemon endpoints. Daemon can fetch and use provider API keys. ProxyProvider works with custom base URL.

### Sprint 4: Web UI and Polish (Week 4-5)
**Goal:** Complete web experience for agent management.

**Parallel Group A (Web - different files):**
- 6.2.1 Sidebar navigation links (sidebar.tsx)
- 6.1.1 Inline Run button on work item row (work-item-row.tsx)
- 6.2.2 Pipeline progress indicator (new file)
- 6.3.2 Queue retry endpoint (queue.py router + service)

**Parallel Group B (Web - after Group A):**
- 6.1.2 Device/provider selector dialog (new file)
- 6.1.3 Wire AgentActionsBar (agent-actions-bar.tsx) -- after 6.1.2
- 6.3.1 Manual retry button in queue view (queue-view.tsx) -- after 6.3.2

**Done criteria:** Can start agent with provider/device selection from web. Pipeline progress visible. Dead letter retry works.

### Sprint 5: Extras (Week 5-6)
**Goal:** CLI device commands, cost tracking, MCP tools.

**All parallel (different files):**
- 7.1.1 bb device list/show (new file)
- 7.1.2 bb device remove -- after 7.1.1
- 7.1.3 Device DELETE endpoint (devices.py)
- 7.1.4 Register device commands (main.py) -- after 7.1.1
- 8.1.2 record_cost function (cost_service.py)
- 8.1.1 Record cost on completion (agent_session_service.py) -- after 8.1.2
- 8.1.3 Send token_usage from daemon (daemon.py)
- 8.2.1 Cost summary page (new file)
- 8.2.2 Cost sidebar link (sidebar.tsx)
- 9.1.1 MCP devices tool (tools.py)
- 9.1.2 MCP queue tool (tools.py)

**Done criteria:** Full device management CLI. Costs recorded and visible. MCP tools available.

---

## Critical Path (Sequential Dependencies)

```
2.1.2 Device model uid column
  -> 2.1.3 Register-or-update endpoint
     -> 2.1.4 Daemon sends device_uid
        -> 1.2.1 Daemon uses queue
           -> 1.2.2 Queue completion reporting
              -> 2.3.1 Worker pool
                 -> 2.5.1 Graceful shutdown

1.1.1 Dispatch service
  -> 1.1.2 Wire into start_session
     -> (connects to daemon path above)

1.3.1 Phase-status auto-sync
  -> 1.3.2 Skip evidence gates
  -> 1.3.3 Broadcast WS
```

**Minimum viable end-to-end flow requires:** 1.1.1, 1.1.2, 1.2.1, 1.2.2, 1.3.1 (5 tasks, ~10 SP)

---

## Parallel Execution Map

Tasks that can be run simultaneously by bb agent without merge conflicts:

| Slot | Task | Package | Primary File |
|------|------|---------|-------------|
| A | 1.1.1 dispatch_service | api | services/dispatch_service.py (new) |
| B | 1.3.1 phase-status sync | api | services/agent_session_service.py |
| C | 2.1.2 device_uid column | api | models/device.py + migration |
| D | 4.1.2 last_activity_at | api | models/agent_session.py + migration |

After merging A, B, C:
| Slot | Task | Package | Primary File |
|------|------|---------|-------------|
| A | 1.1.2 wire dispatch | api | routers/agent_sessions.py |
| B | 1.3.2 skip evidence gates | api | services/lifecycle_service.py |
| C | 2.1.3 register-or-update | api | services/device_service.py + routers/devices.py |

CLI tasks (daemon.py is the bottleneck -- must be sequential):
2.1.1 -> 2.2.1 -> 2.1.4 -> 1.2.1 -> 1.2.2 -> 1.2.3 -> 2.3.1 -> 2.3.2 -> 2.5.1

New file tasks (always safe to parallelize):
- 5.1.1 ProxyProvider (cli/bb_cli/providers/proxy.py)
- 6.1.2 Agent start dialog (web, new component)
- 6.2.2 Pipeline progress (web, new component)
- 7.1.1 Device CLI commands (cli/bb_cli/commands/device.py)
- 8.2.1 Cost page (web, new page)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| daemon.py is a bottleneck (many sequential CLI tasks) | Merge conflicts | Batch daemon changes into 2-3 larger tasks, not 10 tiny ones |
| Migration conflicts (multiple model changes) | DB migration chain breaks | Run migrations sequentially, never in parallel |
| WebSocket event format changes break web UI | Runtime errors | Define event schemas, test WS integration |
| Device auth breaks existing daemon | Daemon can't connect | Add auth as optional first (check header if present), make mandatory in next sprint |

---

## Success Metrics

1. **End-to-end flow works:** Web UI "Run" -> queue -> daemon -> execute -> status updates -> web shows completion
2. **No orphaned sessions:** Crash recovery cleans up within 2 minutes
3. **Concurrent execution:** Daemon processes 2+ sessions simultaneously
4. **Multi-project:** One daemon serves all configured projects
5. **Cost visibility:** Every session has cost recorded and visible in dashboard

---

## Total Estimates

| Epic | Stories | Tasks | Story Points |
|------|---------|-------|-------------|
| 1. Dispatch Pipeline | 3 | 9 | 15 |
| 2. Production Daemon | 6 | 12 | 20 |
| 3. Device Auth | 2 | 6 | 10 |
| 4. Session Reliability | 2 | 4 | 5 |
| 5. Proxy Provider | 1 | 3 | 5 |
| 6. Web UI | 3 | 7 | 12 |
| 7. CLI Device Commands | 1 | 4 | 5 |
| 8. Cost Tracking | 2 | 5 | 8 |
| 9. MCP Tools | 1 | 2 | 4 |
| **Total** | **21** | **52** | **84** |

Estimated timeline: 5-6 weeks with AI agent execution, 8-10 weeks manual.

---

## Next Steps

1. Create all epics, stories, and tasks in Bumblebee
2. Start Sprint 1 with parallel groups (API tasks first, then CLI)
3. Execute via `bb agent batch-run` for parallel-safe groups
4. Sequential tasks via `bb agent run` one at a time
