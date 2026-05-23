# Bumblebee — Hướng dẫn sử dụng (đầy đủ)

Single source of truth cho người dùng cuối. Mỗi mục có UI clicks + CLI commands + API calls.

---

## Mục lục

1. [Tổng quan & kiến trúc](#1-tổng-quan--kiến-trúc)
2. [Cài đặt 3 phút](#2-cài-đặt-3-phút)
3. [Đăng ký + tạo workspace](#3-đăng-ký--tạo-workspace)
4. [Tạo project + link source code](#4-tạo-project--link-source-code)
5. [Pair máy (worker daemon)](#5-pair-máy-worker-daemon)
6. [Tạo issue + Triager phân tích](#6-tạo-issue--triager-phân-tích)
7. [Approval flow](#7-approval-flow)
8. [PLAN — Coordinator agent](#8-plan--coordinator-agent)
9. [EXECUTE — workflow chạy thật](#9-execute--workflow-chạy-thật)
10. [Streaming + Interactive (cancel/intervene)](#10-streaming--interactive)
11. [Staging branch + e2e/smoke](#11-staging-branch--e2esmoke)
12. [GitHub webhook integration](#12-github-webhook-integration)
13. [Tích hợp Claude Code / Cursor / Codex](#13-tích-hợp-claude-code--cursor--codex)
14. [Billing](#14-billing)
15. [Ops: metrics, Sentry, backup](#15-ops-metrics-sentry-backup)
16. [API: REST · GraphQL · MCP · WebSocket](#16-api-rest--graphql--mcp--websocket)
17. [Pháp lý: Terms · Privacy](#17-pháp-lý-terms--privacy)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. Tổng quan & kiến trúc

**Bumblebee = server quản lý task + agent chạy local trên máy bạn**. Vision:

```
[Web UI / CLI / MCP / Claude Desktop]
         ↓
   [Server: orchestrator + state machine + billing]   ← code KHÔNG ở đây
         ↓ enqueue task
   [Postgres task_queue + SKIP LOCKED]
         ↓ claim (filter by required_project_id)
   [bb daemon trên máy bạn]
         ↓ spawn `claude --print`
   [Repo của bạn] ←──── code ở đây + local Claude CLI gọi LLM
         ↓ apply diff, run tests, commit
   [report events qua /api/tasks/{id}/report]
         ↓ WebSocket broadcast
   [Web UI nhận realtime]
```

**3 layer execution**: per-NODE (track cost/tokens) · per-DEVICE (route by project binding) · per-PROCESS (clean isolation per LLM call).

---

## 2. Cài đặt 3 phút

### Cách 1 — Bumblebee Cloud (waitlist)

https://bumblebee.dev → Sign up.

### Cách 2 — Self-host

```bash
git clone https://github.com/lct1407/bumblebee
cd bumblebee

# Linux/Mac
./scripts/install.sh

# Windows
.\scripts\install.ps1

# Hoặc manual:
docker compose up -d           # Postgres + api + web
pip install -e .
alembic upgrade head
python -m bumblebee.seeds.seed_default
cd web && npm install && npm run dev
```

Mở `http://localhost:3000`.

---

## 3. Đăng ký + tạo workspace

### Web UI

`/register` → email + username + password + (tuỳ chọn) workspace_name → Submit → tự tạo workspace + bạn là Owner.

### GraphQL

```graphql
mutation Signup($i: SignupInput!) {
  signup(input: $i) {
    accessToken
    user { id username email }
    workspace { id name slug plan role }
  }
}
```

Variables:
```json
{ "i": { "email": "you@me.com", "username": "you", "password": "secret123" } }
```

### CLI

```bash
bb login you
# password prompt → token saved to ~/.bumblebee/cli.json
bb whoami       # verify
```

---

## 4. Tạo project + link source code

### Validation cho repo (BB-15)

Server chấp nhận:
- **Absolute local path** (`/home/u/code/myapp`, `D:/Source/myapp`) — phải có `.git`
- **HTTPS URL** (`https://github.com/owner/repo`)
- **SSH URL** (`git@github.com:owner/repo.git`)
- **Bare owner/repo** (`lct1407/bumblebee` → tự thêm GitHub prefix)

### CLI

Hiện chưa có command `bb project create` — tạo qua web hoặc trực tiếp DB. Sẽ wire trong sprint sau.

### GraphQL (mutation chưa expose) — tạm dùng REST

Project được tạo qua seed script hoặc UI. UI link repo + edit base_branch/staging_branch.

---

## 5. Pair máy (worker daemon)

### Step 1 — CLI in máy bạn (terminal)

```bash
bb device pair --server http://localhost:8000 --workspace <slug>
# → in ra: Pairing code: ABCD1234
```

### Step 2 — Web

`/settings/devices` → nhập `ABCD1234` → **Confirm pairing** → web trả `nt_xxxxxxxx`.

### Step 3 — Save token + start daemon

```bash
bb device save-token nt_xxxxxxxx
bb daemon                          # foreground, blocks terminal
# hoặc background:
nohup bb daemon > ~/.bumblebee/daemon.log 2>&1 &     # Linux/Mac
start /B bb daemon                                    # Windows
```

### Step 4 — Bind device với project (BB-16)

```bash
# Lấy node_id từ /settings/devices, project_id từ /projects
curl -X POST http://localhost:8000/api/devices/<node_id>/bind-projects \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"project_ids":["<project-uuid>"]}'
```

Task router (BB-18) sẽ chỉ route tasks của project này tới máy này.

### Heartbeat manifest (BB-17)

Daemon gửi `repos_discovered` mỗi 30s. Server thấy được những repos nào device có sẵn → match với `project.repo_path`.

---

## 6. Tạo issue + Triager phân tích

### Web

`/issues` → **+ New Issue** → title + description → Create.

Sau ~10-30s, Triager agent (nếu BUMBLEBEE_PROVIDER=claude-cli) sẽ update:
- `complexity` ∈ {simple, medium, complex}
- `ai_summary`, `ai_suggested_solution`, `ai_acceptance_criteria`
- `scope_hints` = file globs

### CLI

```bash
bb issue list --project bb
bb issue create "Fix login bug" --project bb --priority high
```

### GraphQL

```graphql
mutation($i: IssueCreateInput!) {
  createIssue(input: $i) { id number title status }
}
```

---

## 7. Approval flow

H2 approval gate logic:

| Status | Complexity | Policy `auto_execute_simple` | Cho phép dispatch? |
|---|---|---|---|
| `APPROVED` | bất kỳ | — | ✅ |
| `NEW`/`TRIAGED`/`PLANNED` | `simple` | ON | ✅ (auto bypass) |
| `NEW`/`TRIAGED`/`PLANNED` | `simple` | OFF | ❌ |
| `NEW`/`TRIAGED`/`PLANNED` | `medium`/`complex` | bất kỳ | ❌ |
| terminal (`CLOSED`/`FAILED`/`WONT_FIX`/`RELEASED`) | bất kỳ | — | ❌ |

### Approve trên web

`/issues/<n>` → click **✅ Approve** button (xanh dotted lên khi đã approved).

### Approve qua GraphQL

```graphql
mutation($id: UUID!) { approveIssue(id: $id) { number status } }
```

---

## 8. PLAN — Coordinator agent

Workflow `feature-complex-flow` có node `plan` chạy Coordinator role.

### Web

`/issues/<n>` → **🧠 Plan** button → server trigger `feature-complex-flow`.

### CLI

```bash
BUMBLEBEE_PROVIDER=claude-cli PYTHONPATH=. \
  python scripts/run-planner-demo.py <issue-number>
```

→ Claude CLI thật chạy, trả plan có sub-tasks chi tiết (4-6 sub-tasks per issue complex).

### Provider matrix

| Provider | Lệnh | Note |
|---|---|---|
| `stub` (default) | `BUMBLEBEE_PROVIDER=stub` | Canned response, không gọi LLM |
| `claude-cli` | `BUMBLEBEE_PROVIDER=claude-cli` | Subprocess `claude --print` |
| `gemini` | `BUMBLEBEE_PROVIDER=gemini` | Vertex AI Gemini |

---

## 9. EXECUTE — workflow chạy thật

### Web

`/issues/<n>` → **▶ Trigger workflow** → H1 router chọn workflow theo complexity:
- `simple` → `simple-fix-flow` (triage → implement → test → done)
- `complex` → `feature-complex-flow` (triage → plan → fan_out implementers → integrate → review → deploy → qa → release)

### CLI

```bash
BUMBLEBEE_PROVIDER=claude-cli PYTHONPATH=. \
  python scripts/run-full-flow-demo.py <issue-number> simple-fix-flow
```

Output:
```
nodes completed: ['triage', 'implement', 'test']
SESSIONS RAN
  triager       completed   cost=$0.0028  tokens=855/17
  implementer   completed   cost=$0.0026  tokens=842/7
  tester        completed   cost=$0.0024  tokens=748/12
```

### Per-node tracking

Mỗi node = 1 `AgentSession` row với:
- `tokens_in` / `tokens_out`
- `dollars_used`
- `started_at` / `completed_at`
- `failure_reason` (nếu fail)

### Daemon `role_exec` mode (BB-6)

Khi task có `payload.command_kind == "role_exec"`, daemon:
1. Spawn `claude --print --output-format=json` với role prompt + context
2. Parse JSON output
3. Extract diff từ ```diff fenced block
4. `git apply` diff vào worktree
5. Report events qua `/api/tasks/{id}/report`

---

## 10. Streaming + Interactive

### Web: realtime event feed

Issue detail page subscribe WebSocket `/ws?project=<slug>` → mọi `task_log`, `role_exec_output`, `git_apply_result` events hiện ngay.

### Cancel running workflow

```bash
curl -X POST http://localhost:8000/api/workflow-runs/<run_id>/cancel
```

→ Đánh dấu run + sessions = CANCELED, task_queue items = cancelled. Daemon thấy lease invalidated, dừng.

### User intervention (gửi message vào agent đang chạy)

```bash
curl -X POST http://localhost:8000/api/workflow-runs/<run_id>/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Use TypeScript instead of JS"}'
```

→ Event `user_intervention` được append vào log. Agent đang chạy sẽ thấy ở vòng lặp tiếp.

---

## 11. Staging branch + e2e/smoke

Sau khi Reviewer approve, lifecycle:

```
DEVELOPED → DEPLOYING (worker merge feature → stg)
          → TESTING   (worker run npm test:smoke / pytest -k e2e)
          → STAGING   (resting, đợi promote)
          → RELEASED  (worker merge stg → main)
```

Config per-project trong `policy_config`:

```json
{ "staging_branch": "stg", "auto_execute_simple": false }
```

---

## 12. GitHub webhook integration

### Setup

GitHub repo → Settings → Webhooks → Add:
- URL: `https://your.server/api/webhooks/github`
- Content type: `application/json`
- Secret: cùng giá trị với `GITHUB_WEBHOOK_SECRET` trong `.env`
- Events: Pull requests · Issues · Pushes · Issue comments

### Mapping (BB-I3 + BB-13)

| GitHub event | Bumblebee action |
|---|---|
| `pull_request.opened` | Create Issue (type=feature, status=new) |
| `pull_request.closed.merged=true` | Update Issue → status=released |
| `pull_request.synchronize` | Update Issue → status=in_progress |
| `issues.opened` | Mirror as Bumblebee issue |
| `push` với commit `"fix #N msg"` | Auto-create bug issue |
| `push` với `"TODO: msg"` | Auto-create task issue |

---

## 13. Tích hợp Claude Code / Cursor / Codex

```bash
cd /path/to/your/repo

bb skills install --target=claude-code   # .claude/agents/bumblebee-*.md
bb skills install --target=cursor        # .cursor/rules/bumblebee-*.mdc
bb skills install --target=codex         # AGENTS.md (idempotent block)
bb skills install --target=generic       # .bumblebee/agents/

bb skills targets                        # list options
```

11 role prompts ship cùng: triager · planner · coordinator · implementer · tester · reviewer · integrator · merger · documenter · failure_diagnostician · assistant.

Sau khi cài, mở Claude Code trong repo và hỏi: _"Act as the Bumblebee Reviewer role and review my diff"_.

---

## 14. Billing

3 plans:

| Plan | Giá | Issues | LLM cap | Workspaces |
|---|---|---|---|---|
| Free | $0 | 5 active | $1/mo | 1 |
| Pro | $20/seat/mo | unlimited | $20/seat/mo | 5 |
| Team | $100 + LLM passthrough | unlimited | metered | unlimited |

### Upgrade qua web

`/settings/billing` → Choose plan → Stripe Checkout → tự redirect về với plan mới.

### GraphQL

```graphql
mutation($i: CheckoutSessionInput!) {
  createCheckoutSession(input: $i) { sessionId url }
}
```

### Webhook handlers

- `customer.subscription.created` → set ws.plan + ws.stripe_subscription_id
- `customer.subscription.updated` (canceled) → reset ws.plan = FREE
- `invoice.paid` → reset llm_spend_cents_this_period
- `invoice.payment_failed` → set ws.payment_overdue = true

---

## 15. Ops: metrics, Sentry, backup

### /metrics endpoint (BB-9)

Prometheus exposition tại `http://localhost:8000/metrics`. Metrics:
- `bb_uptime_seconds`
- `bb_issues{status="..."}` count
- `bb_workflow_runs{status="..."}` count
- `bb_agent_nodes{status="..."}` count
- `bb_counter{name="..."}` (in-process)

### Sentry (opt-in)

Set `SENTRY_DSN=https://...@sentry.io/...` trong `.env` → tự init khi app start. FastAPI + SQLAlchemy integrations.

### DB backup cron

```bash
# Crontab
0 2 * * * /path/to/scripts/backup-postgres-cron.sh
```

Env:
- `DATABASE_URL` (required)
- `BACKUP_DIR` (default `/var/backups/bumblebee`)
- `BACKUP_S3_BUCKET` (optional, copies via aws CLI)
- `BACKUP_RETENTION_DAYS` (default 14)

---

## 16. API: REST · GraphQL · MCP · WebSocket

### REST endpoints (cho external integrations)

- `POST /api/webhooks/stripe` — Stripe webhook
- `POST /api/webhooks/github` — GitHub webhook
- `POST /api/devices/{pair-request,pair-confirm/{code},heartbeat,/<id>/bind-projects,/<id>/revoke}`
- `POST /api/tasks/{claim,report,ack,fail}`
- `POST /api/workflow-runs/{trigger,/<id>/cancel,/<id>/message}`
- `GET  /health`, `/health/db`, `/metrics`

### GraphQL (cho web/CLI)

`POST /graphql` + `GET /graphql` (GraphiQL playground)

Queries: `me`, `workspace`, `projects`, `project`, `issues`, `issue`, `events`, `nodes`

Mutations: `signup`, `login`, `createApiKey`, `createIssue`, `updateIssue`, `approveIssue`, `devicePairRequest`, `devicePairConfirm`, `createCheckoutSession`

### MCP (cho Claude Desktop / Cursor)

```bash
python -m bumblebee_mcp.cli           # stdio
python -m bumblebee_mcp.http_server   # HTTP streamable
```

7 tools: `bumblebee_workspaces`, `bumblebee_issues`, `bumblebee_events`, `bumblebee_workflows`, `bumblebee_audit`, `bumblebee_smart_create_issue`, `bumblebee_ask`.

### WebSocket realtime

```js
const ws = new WebSocket("ws://localhost:8000/ws?project=bb&token=<jwt>");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

Events: mọi `append_event` call auto-broadcast.

---

## 17. Pháp lý: Terms · Privacy

- `/legal/terms` — Terms of Service
- `/legal/privacy` — Privacy Policy

Code không upload server (worker chạy local). Sub-processors: Stripe · Anthropic · Google Vertex · Sentry (opt-in).

---

## 18. Troubleshooting

| Lỗi | Cách fix |
|---|---|
| `bb device pair` báo "no_workspace" | Tạo user + workspace trước qua `/register` |
| Daemon "no claude binary on PATH" | `npm install -g @anthropic-ai/claude-code && claude login` |
| `workflow_runs.workspace_id violates not-null` | Đăng ký auto-scope listeners: `register_auto_scope_listeners()` |
| GraphQL `workspace_required` | Token không có `ws` claim → re-login |
| `task_queue` không claim được | Check `bound_project_ids` của node + `required_project_id` của task |
| Migration fail "duplicate column" | DB không sync — `alembic stamp head` rồi `alembic upgrade head` |
| Stripe webhook 401 | `STRIPE_WEBHOOK_SECRET` không match — copy từ Stripe Dashboard |
| Web page 0 of 0 issues | Anonymous user, login để load REST endpoint với JWT |

---

**Cập nhật cuối:** 2026-05-23

---

# E2E walkthrough captured live

Tất cả output dưới là từ **live run trên prod DB** ngày 2026-05-23. Có thể copy-paste chạy lại.

## Step 0 — Verify servers ready

```bash
curl -s -o /dev/null -w "API:%{http_code}\n" http://localhost:8000/health/
curl -s -o /dev/null -w "WEB:%{http_code}\n" http://localhost:3000/
```

```
API:307
WEB:200
```

## Step 1 — Signup (creates user + workspace + JWT)

```bash
TS=$(date +%s)
RESPONSE=$(curl -s -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation(\$i: SignupInput!){signup(input:\$i){accessToken user{username} workspace{name slug plan}}}\",
       \"variables\":{\"i\":{\"email\":\"e2e-$TS@bb.test\",\"username\":\"e2e$TS\",\"password\":\"e2etest123\",\"workspaceName\":\"E2E Test\"}}}")
echo "$RESPONSE" | python -m json.tool
```

Output:
```json
{
  "data": {
    "signup": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...",
      "user": { "username": "e2e1779578742" },
      "workspace": { "name": "E2E Test", "slug": "e2e-test", "plan": "FREE" }
    }
  }
}
```

## Step 2 — Pair device (worker daemon registration)

### 2a. CLI initiate pair request

```bash
# On your local machine
PAIR=$(curl -s -X POST http://localhost:8000/api/devices/pair-request \
  -H "Content-Type: application/json" \
  -d '{"name":"my-laptop","capabilities":["claude-cli","git"],"platform":"win32","hostname":"my-machine","workspace_slug":"e2e-test"}')
echo "$PAIR" | python -m json.tool
```

Output:
```json
{
  "pairing_code": "XH6H8E95",
  "node_id": "8d6d9f9c-457d-497b-905d-374454a556e0",
  "expires_at": "2026-05-23T23:36:10.606999Z"
}
```

### 2b. Confirm pairing in web (authenticated)

```bash
TOKEN="<JWT from step 1>"
CODE="XH6H8E95"
curl -s -X POST "http://localhost:8000/api/devices/pair-confirm/$CODE" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Output:
```json
{
  "node_id": "8d6d9f9c-457d-497b-905d-374454a556e0",
  "name": "my-laptop",
  "node_token": "nt_I3wBX9Xji8yP6Q0fOS4-GJqZK9crIatCfzSja..."
}
```

### 2c. Save token + start daemon

```bash
bb device save-token nt_I3wBX9Xji8yP6Q0fOS4-GJqZK9crIatCfzSja...
bb daemon --server http://localhost:8000
```

Daemon then heartbeats every 30s with capabilities + discovered repos (BB-17).

### 2d. (Optional) Bind device to specific project

```bash
NODE_ID="8d6d9f9c-457d-497b-905d-374454a556e0"
PROJECT_ID="ded46e55-3f7f-4738-a821-891cdcd4bd83"
curl -s -X POST "http://localhost:8000/api/devices/$NODE_ID/bind-projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"project_ids\":[\"$PROJECT_ID\"]}"
```

Now task router (BB-18) only routes tasks of this project to this node.

## Step 3 — Create issue via GraphQL

```bash
PROJECT_ID="ded46e55-3f7f-4738-a821-891cdcd4bd83"
curl -s -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"mutation(\$i: IssueCreateInput!){createIssue(input:\$i){id number title status complexity}}\",
       \"variables\":{\"i\":{\"projectId\":\"$PROJECT_ID\",
                              \"title\":\"E2E: improve /health/db endpoint response\",
                              \"description\":\"Endpoint returns plain {db:ok} but should include pool stats and DB version while keeping backward compat.\",
                              \"type\":\"FEATURE\",\"priority\":\"MEDIUM\"}}}"
```

Output:
```
Created issue BB-4: E2E: improve /health/db endpoint response
  id: 5000fe5f-441f-40fd-aed1-7a792917cf47
  status: NEW, complexity: None
```

## Step 4 — Triager updates (set complexity + scope_hints)

In production, the Triager agent does this automatically when an issue is created.
Manual equivalent:

```bash
ISSUE_ID="5000fe5f-441f-40fd-aed1-7a792917cf47"
curl -s -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"mutation(\$id:UUID!,\$i:IssueUpdateInput!){updateIssue(id:\$id,input:\$i){number status complexity scopeHints}}\",
       \"variables\":{\"id\":\"$ISSUE_ID\",
                       \"i\":{\"complexity\":\"MEDIUM\",
                             \"scopeHints\":[\"bumblebee/routers/health.py\"],
                             \"status\":\"TRIAGED\"}}}"
```

Output:
```json
{"data":{"updateIssue":{"number":4,"status":"TRIAGED","complexity":"MEDIUM","scopeHints":["bumblebee/routers/health.py"]}}}
```

## Step 5 — Plan (Coordinator agent via real Claude CLI)

Force `feature-complex-flow` to invoke the Plan node:

```bash
BUMBLEBEE_PROVIDER=claude-cli PYTHONPATH=. \
  python scripts/run-planner-demo.py 4
```

Output (real Claude CLI output, truncated):
```
=== Trigger Planner on BB-4 ===
Provider: claude-cli
...
Final state:
  status: completed
  nodes completed: ['triage', 'plan']
  last_result: {'text': '{"plan_summary": "Extend /health/db response with pool stats + DB version while preserving {db: \"ok\"} backward-compat key. Split into 4 sub-tasks ...", "sub_tasks": [
    {"role":"implementer","scope":["bumblebee/routers/health.py"], "budget_tokens": 6000},
    {"role":"tester","scope":["tests/test_health.py"], "budget_tokens": 4000},
    ...
  ]}'}
```

## Step 6 — Approve (unblocks dispatch)

```bash
curl -s -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"mutation(\$id:UUID!){approveIssue(id:\$id){number status}}\",
       \"variables\":{\"id\":\"$ISSUE_ID\"}}"
```

Output:
```json
{"data":{"approveIssue":{"number":4,"status":"APPROVED"}}}
```

## Step 7 — Trigger workflow (H1 router auto-picks)

```bash
curl -s -X POST http://localhost:8000/api/workflow-runs/trigger \
  -H "Content-Type: application/json" \
  -d "{\"issue_id\":\"$ISSUE_ID\"}"
```

Output:
```json
{"workflow_run_id":"ff960d3a-af0e-45e9-aec6-e1fc4aeb71e7","workflow_name":"simple-fix-flow","status":"completed"}
```

H1 picked `simple-fix-flow` because complexity=medium.

## Step 8 — Verify execution (events + agent sessions)

```bash
PYTHONPATH=. python -c "
import asyncio
from sqlalchemy import select
from bumblebee.database import SessionLocal
from bumblebee.models.event import Event
from bumblebee.models.agent_session import AgentSession
async def m():
    async with SessionLocal() as db:
        events = (await db.execute(select(Event).where(Event.issue_id=='$ISSUE_ID').order_by(Event.occurred_at))).scalars().all()
        print(f'=== Events ({len(events)}) ===')
        for e in events: print(f'  {e.occurred_at:%H:%M:%S}  {e.type:<25}')
        sessions = (await db.execute(select(AgentSession).where(AgentSession.issue_id=='$ISSUE_ID').order_by(AgentSession.started_at))).scalars().all()
        print(f'=== AgentSessions ({len(sessions)}) ===')
        for s in sessions:
            print(f'  {s.role:<14}  status={s.status.value}  cost=\${s.dollars_used:.4f}  tokens={s.tokens_in}/{s.tokens_out}')
asyncio.run(m())
"
```

Output:
```
=== Events (14) ===
  23:28:59  workflow_started
  23:29:02  session_started
  23:29:06  llm_call
  23:29:07  cost_charged
  23:29:09  session_completed
  23:29:11  session_started
  23:29:12  llm_call
  23:29:13  cost_charged
  23:29:15  session_completed
  23:29:16  session_started
  23:29:18  llm_call
  23:29:19  cost_charged
  23:29:20  session_completed
  23:29:21  workflow_completed

=== AgentSessions (3) ===
  triager       status=completed   cost=$0.0028  tokens=855/17
  implementer   status=completed   cost=$0.0026  tokens=842/7
  tester        status=completed   cost=$0.0024  tokens=748/12
```

3 LLM calls (triager → implementer → tester), total cost $0.0078, full flow ~22 seconds.

## Step 9 — Cancel running workflow (interactive)

If you want to stop mid-execution:

```bash
RUN_ID="ff960d3a-af0e-45e9-aec6-e1fc4aeb71e7"
curl -s -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"
```

## Step 10 — Merge to staging branch (Phase I)

After workflow status = DEVELOPED, enqueue merge_to_staging task:

```python
# From orchestrator or admin
from bumblebee.services.control.staging_flow import enqueue_merge_to_staging
await enqueue_merge_to_staging(
    db, issue=issue, project=project,
    feature_branch="feature/bb-4-health-db"
)
# Status → DEPLOYING
# Worker daemon claims task, runs:
#   git fetch --all
#   git checkout stg && git pull --ff-only
#   git merge --no-ff --no-edit feature/bb-4-health-db
#   git push origin stg
```

## Step 11 — Run e2e/smoke on staging

```python
from bumblebee.services.control.staging_flow import enqueue_e2e_smoke
await enqueue_e2e_smoke(db, issue=issue, project=project,
                       gates=["smoke", "e2e:critical"])
# Status → TESTING
# Worker runs: npm run test:smoke && pytest -k e2e
```

After tests green → status STAGING → manually promote to RELEASED.

## Step 12 — Add relations + custom fields (Jira-style)

```bash
# Relation: BB-4 depends_on BB-5
curl -s -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation($i: RelationCreateInput!){addIssueRelation(input:$i){id kind}}",
       "variables":{"i":{"sourceIssueId":"<BB-4-uuid>","targetIssueId":"<BB-5-uuid>","kind":"depends_on","note":"need source-aware context first"}}}'

# Custom fields: severity, repro_steps
curl -s -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation($i: CustomFieldsUpdateInput!){setCustomFields(input:$i){number customFields}}",
       "variables":{"i":{"issueId":"<uuid>","customFields":{"severity":"critical","affected_version":"v0.4.0"}}}}'
```

## TL;DR of entire flow

```
1. signup           → JWT + workspace
2. pair-request     → pairing_code  
3. pair-confirm     → node_token
4. save-token       → ~/.bumblebee/node.json
5. bb daemon        → long-poll /api/tasks/claim
6. createIssue      → BB-N (status=NEW)
7. updateIssue      → set complexity/scope_hints (Triager auto in prod)
8. approveIssue     → status=APPROVED (gate unlocked)
9. POST /trigger    → H1 picks workflow by complexity
10. orchestrator    → spawns N AgentSessions (triager/implementer/tester/...)
11. daemon claims   → spawns claude --print per role
12. events streamed → WS broadcast to web UI in realtime
13. status → DEVELOPED
14. enqueue_merge_to_staging → daemon git merge → status DEPLOYING
15. enqueue_e2e_smoke → daemon runs tests → status TESTING → STAGING
16. (manual promote) → RELEASED → CLOSED
```

Full path: **issue → plan → approve → execute → merge stg → test → release**.

Per-node tracking (cost/tokens in AgentSession) · per-device routing (bound_project_ids) · per-process execution (claude CLI subprocess) — all 3 layers working together.
