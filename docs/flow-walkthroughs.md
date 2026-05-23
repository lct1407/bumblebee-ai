# Flow walkthroughs — what actually happens end-to-end

Each section traces ONE user-facing action through every layer.
For background on the layers see [architecture-overview.md](./architecture-overview.md).

---

## 1. Sign up via email

```
Browser                       FastAPI /api/auth/register             Postgres
   │                                  │                                 │
   │ POST {username, email, pwd}      │                                 │
   ├─────────────────────────────────►│                                 │
   │                                  │ bcrypt(pwd, cost=12)            │
   │                                  │ INSERT users                    │
   │                                  ├────────────────────────────────►│
   │                                  │ INSERT workspaces (Phase A      │
   │                                  │   auto-create per-user ws)      │
   │                                  ├────────────────────────────────►│
   │                                  │ INSERT workspace_members        │
   │                                  │   (role=owner)                  │
   │                                  ├────────────────────────────────►│
   │                                  │ create_access_token(            │
   │                                  │   sub=user.id,                  │
   │                                  │   ws=workspace.id,              │
   │                                  │   role='owner'                  │
   │                                  │ )                               │
   │ {access_token, user, workspace}  │                                 │
   │◄─────────────────────────────────┤                                 │
   │ localStorage.setItem(            │                                 │
   │   bumblebee.token,               │                                 │
   │   bumblebee.activeWorkspace      │                                 │
   │ )                                │                                 │
   │ → router.push('/onboard')        │                                 │
```

Key code:
- `bumblebee/routers/auth.py::register` — handler
- `bumblebee/auth/security.py::create_access_token` — JWT minter (HS256, 24h TTL)
- `web/src/app/(public)/register/page.tsx` — UI

---

## 2. Sign in with Google

```
Browser                  FastAPI                           Google
   │ /login                  │                                │
   │ click "Continue with G" │                                │
   ├────────────────────────►│                                │
   │ /api/auth/google/start  │                                │
   │ ◄── 302 redirect ──     │                                │
   │   accounts.google.com   │                                │
   │   ?state=<csrf>         │                                │
   │   ?client_id=...        │                                │
   │   ?scope=openid+email   │                                │
   ├──────────────────────────────────────────────────────────►│
   │                         │                                │ consent
   │ ◄────── 302 ────────────┼────────────────────────────────┤
   │   /api/auth/google/     │                                │
   │   callback?code=...     │                                │
   │   &state=<csrf>         │                                │
   ├────────────────────────►│                                │
   │                         │ verify state                   │
   │                         │ exchange code → tokens        │
   │                         ├───────────────────────────────►│
   │                         │ GET userinfo                   │
   │                         ├───────────────────────────────►│
   │                         │ ◄─── {sub, email, name}        │
   │                         │ SELECT or INSERT user          │
   │                         │ link oauth_provider=google     │
   │                         │ INSERT workspace if new        │
   │                         │ mint JWT                       │
   │                         │                                │
   │ ◄── 302 ─────────────── │                                │
   │  /auth/google/complete  │                                │
   │  #token=<jwt>&ws_slug=  │  (fragment never sent to       │
   │   ...&new=1             │   server — no token in logs)   │
   │ JS reads #fragment      │                                │
   │ localStorage + redirect │                                │
   │ /onboard or /dashboard  │                                │
```

Key code:
- `bumblebee/routers/oauth_google.py` — backend OAuth flow
- `web/src/app/auth/google/complete/page.tsx` — fragment-reading landing
- `docs/security/google-oauth-setup.md` — operator setup

---

## 3. Create an issue (UI flow)

```
Browser                       /api/issues                  Auto-scope        Postgres
   │ user clicks "New issue"     │ POST                       │                  │
   │ fills IssueForm             │                            │                  │
   ├────────────────────────────►│                            │                  │
   │                             │ Issue(workspace=NULL,      │                  │
   │                             │       project_id=X,        │                  │
   │                             │       ...)                 │                  │
   │                             │ → before_insert            │                  │
   │                             ├───────────────────────────►│ SELECT           │
   │                             │                            │ workspace_id     │
   │                             │                            │ FROM projects    │
   │                             │                            │ WHERE id = X     │
   │                             │                            │ ←─────────       │
   │                             │ Issue.workspace_id = Y     │                  │
   │                             │ INSERT issues              │                  │
   │                             ├───────────────────────────────────────────────►│
   │                             │ append_event("issue_created", issue_id=...)   │
   │                             ├───────────────────────────────────────────────►│
   │                             │ → ws broadcast {type:"event", ...}            │
   │ ◄── 201 {issue}             │                            │                  │
   │ ◄── WS event "issue_created"│                            │                  │
   │ React Query invalidate      │                            │                  │
   │ → list refreshes            │                            │                  │
```

The **auto-scope listener** (`services/rbac/auto_scope.py`) means the router doesn't have to thread `workspace_id` through everywhere — it's derived from the parent project. Production paths SHOULD set it explicitly; this is a safety net.

---

## 4. Trigger a workflow on an issue (the full agent loop)

This is the **big one**. Click "Trigger workflow" on BB-3 → triage → planner → implementer → tester → reviewer → merger, with live token streaming.

```
Browser            FastAPI                  Orchestrator           Harness            ClaudeCLI
   │                  │                          │                     │                 │
   │ POST /trigger    │                          │                     │                 │
   ├─────────────────►│                          │                     │                 │
   │                  │ execute_workflow_run     │                     │                 │
   │                  ├─────────────────────────►│                     │                 │
   │                  │                          │ LangGraph.invoke    │                 │
   │                  │                          │  → node: triager    │                 │
   │                  │                          ├────────────────────►│                 │
   │                  │                          │                     │ check budgets   │
   │                  │                          │                     │ check quota     │
   │                  │                          │                     │ assemble Prompt:│
   │                  │                          │                     │  defense baseline│
   │                  │                          │                     │  + system from  │
   │                  │                          │                     │    triager.yaml │
   │                  │                          │                     │  + scope hints  │
   │                  │                          │                     │  + knowledge    │
   │                  │                          │                     │  + issue body   │
   │                  │                          │                     │ invoke_streaming│
   │                  │                          │                     ├────────────────►│
   │                  │                          │                     │                 │ NDJSON
   │                  │ ws broadcast every chunk │                     │ ◄─── delta ─────┤ stream
   │ ◄── llm.chunk ───┤                          │                     │                 │
   │ <LiveStream>     │                          │                     │ on_chunk →      │
   │ updates in realtime │                       │                     │ broadcast WS    │
   │                  │                          │                     │ ◄─── completed ─┤
   │                  │                          │                     │ parse output    │
   │                  │                          │                     │ persist:        │
   │                  │                          │                     │  Issue.complexity│
   │                  │                          │                     │  ai_summary     │
   │                  │                          │                     │  append_event:  │
   │                  │                          │                     │   llm_call,     │
   │                  │                          │                     │   cost_charged, │
   │                  │                          │                     │   session_done  │
   │                  │                          │                     │ record_usage(   │
   │                  │                          │                     │  ws, cost)      │
   │                  │                          │                     │  ↑ Phase D       │
   │                  │                          │                     │  quota counter   │
   │                  │                          │                     │  + (team plan)   │
   │                  │                          │                     │  Stripe meter    │
   │                  │                          │ ◄────────────────── │                 │
   │                  │                          │ → node: planner     │                 │
   │                  │                          │   (same loop)       │                 │
   │                  │                          │ → node: implementer │                 │
   │                  │                          │   (acquires lease,  │                 │
   │                  │                          │    writes files,    │                 │
   │                  │                          │    git commit)      │                 │
   │                  │                          │ → node: tester      │                 │
   │                  │                          │ → node: reviewer    │                 │
   │                  │                          │ → node: merger      │                 │
   │                  │ ◄── workflow_completed ──┤                     │                 │
   │ ◄── 200 {run_id} │                          │                     │                 │
```

Throughout: every state mutation also writes an `event` row. The Activity tab on the issue is a SQL filter `WHERE issue_id = X`. The dashboard's live activity feed is `WHERE workspace_id = X ORDER BY occurred_at DESC LIMIT 30`.

---

## 5. Smart-create an issue from Claude Code (via MCP)

```
Claude Code             MCP HTTP /mcp/call              bumblebee_smart_create_issue       Gemini
     │                         │                                  │                          │
     │ POST {                  │                                  │                          │
     │   name: "bumblebee_     │                                  │                          │
     │     smart_create_issue",│                                  │                          │
     │   args: {prompt: "fix   │                                  │                          │
     │     bcrypt cost too low"│                                  │                          │
     │   }                     │                                  │                          │
     │ }                       │                                  │                          │
     │ Authorization: Bearer   │                                  │                          │
     │   bb_yourkey            │                                  │                          │
     ├────────────────────────►│                                  │                          │
     │                         │ resolve_api_key →                │                          │
     │                         │   McpAuthContext(                │                          │
     │                         │     workspace_id, role)          │                          │
     │                         │ dispatch("smart_create_issue")   │                          │
     │                         ├─────────────────────────────────►│                          │
     │                         │                                  │ build Prompt(            │
     │                         │                                  │   system=SMART_DRAFT,    │
     │                         │                                  │   user=arg.prompt)       │
     │                         │                                  │ GeminiProvider.invoke   │
     │                         │                                  ├─────────────────────────►│
     │                         │                                  │ ◄── JSON draft ─────────┤
     │                         │                                  │ ToolResult.ok(           │
     │                         │                                  │   summary="Drafted:...", │
     │                         │                                  │   data={title, type,...},│
     │                         │                                  │   next_actions=[...]     │
     │                         │                                  │ )                        │
     │                         │ ◄────────────────────────────────┤                          │
     │ ◄── {name, result} ─────┤                                  │                          │
     │ (Claude sees draft,     │                                  │                          │
     │  asks user to confirm)  │                                  │                          │
     │                         │                                  │                          │
     │ user: "yes, commit"     │                                  │                          │
     │ POST same with          │                                  │                          │
     │   commit=true           │                                  │                          │
     ├────────────────────────►│ dispatch + handler runs again    │                          │
     │                         │   with commit=true               │                          │
     │                         │ check Permission.WRITE_ISSUE     │                          │
     │                         │ call bumblebee_mcp.tools         │                          │
     │                         │   .create_issue(draft)           │                          │
     │                         │ → INSERT issues + event          │                          │
     │ ◄── {issue_number} ─────┤                                  │                          │
```

Same flow for `bumblebee_ask`: retrieves top 30 issues + 30 events as context, feeds to Gemini, returns grounded answer with `Sources: BB-3, BB-5` citations.

---

## 6. Stripe upgrade flow (Free → Pro)

```
Browser                Bumblebee API         Stripe                      Webhook handler
   │ /settings/billing      │                  │                                │
   │ click "Upgrade to Pro" │                  │                                │
   ├───────────────────────►│ POST /api/billing/workspace/{id}/checkout-session │
   │                        │ resolve workspace, RBAC check (MANAGE_BILLING)   │
   │                        │ stripe.Customer.create (idempotent, if absent)   │
   │                        ├─────────────────►│                                │
   │                        │ ◄─── customer_id ┤                                │
   │                        │ persist on workspace.stripe_customer_id           │
   │                        │ stripe.checkout.Session.create(                   │
   │                        │   mode=subscription, customer=...,                │
   │                        │   line_items=[price_pro], idempotency_key=...)    │
   │                        ├─────────────────►│                                │
   │                        │ ◄── {url, id} ───┤                                │
   │ ◄── {session_id, url} ─┤                  │                                │
   │ window.location = url  │                  │                                │
   │ ────────────────────►  checkout.stripe.com  (test card 4242 4242 4242 4242)│
   │                                          │                                │
   │ ◄─── 302 back to ──────                  │ user paid → fires webhooks      │
   │ /settings/billing                        │                                │
   │ ?status=success                          ├───────────────────────────────►│
   │                                          │ POST /api/stripe/webhook       │
   │                                          │ event=customer.subscription.   │
   │                                          │   created                      │
   │                                          │                                │ verify signature
   │                                          │                                │ resolve workspace
   │                                          │                                │   by customer_id
   │                                          │                                │ ws.plan = pro
   │                                          │                                │ ws.subscription_id
   │                                          │                                │ ws.period_started
   │                                          │                                │ append_event(
   │                                          │                                │   "subscription_   │
   │                                          │                                │     created")     │
   │                                          ├───────────────────────────────►│
   │                                          │ POST /api/stripe/webhook       │
   │                                          │ event=invoice.paid             │
   │                                          │                                │ reset spend
   │                                          │                                │   counter to 0    │
   │                                          │                                │ payment_overdue = │
   │                                          │                                │   false           │
```

After webhooks fire, next agent run that hits `check_workspace_quota()` sees the new cap and lets the workflow through.

---

## 7. Live agent stream → web UI (the WebSocket pipeline)

```
ClaudeCLI subprocess                Harness               WS manager        Browser
     │ stream-json NDJSON                │                      │                │
     │ {type:"text_delta","delta":"foo"} │                      │                │
     ├──────────────────────────────────►│                      │                │
     │                                   │ on_chunk callback    │                │
     │                                   ├─────────────────────►│                │
     │                                   │ broadcast(workspace, │                │
     │                                   │   {type:"llm.chunk", │                │
     │                                   │    payload:{delta}}) │                │
     │                                   │                      ├───────────────►│
     │                                   │                      │ useEventStream │
     │                                   │                      │ reducer:       │
     │                                   │                      │  session.buffer│
     │                                   │                      │  += delta      │
     │                                   │                      │ <LiveStream>   │
     │                                   │                      │ re-renders     │
```

The browser connects with `WebSocket('ws://.../ws?project=X&token=<JWT>')`. The auth gate (Phase E) validates the JWT, confirms membership in the project's workspace, then registers the socket. Every `append_event()` AND every `on_chunk` callback broadcasts to the project's subscribers.

Frontend reducer in `web/src/lib/event-stream.ts` accumulates deltas into a per-session buffer that `<LiveStream>` renders character-by-character.

---

## 8. Audit log export (CSV streaming)

```
Browser              FastAPI /api/audit/events.csv         Postgres
   │ GET with filters       │ require_permission(EXPORT_AUDIT_LOG)
   ├───────────────────────►│
   │                        │ build query with workspace_id + filters
   │                        │ db.stream(stmt) → server-side cursor
   │                        ├──────────────────────────────────►│
   │                        │ ◄── row 1 ─────                   │
   │                        │ writerow → yield chunk            │
   │ ◄── chunk 1 ───────────│                                   │
   │ ◄── chunk 2 ───────────│ ◄── row 2 ────                    │
   │ ...                    │                                   │
   │ ◄── chunk N ───────────│ ◄── row N ────                    │
```

Memory bounded: never materializes the full result set. The browser triggers a download because of `Content-Disposition: attachment`.

---

## How to read the code if you want to trace yourself

1. Start at the **router** (e.g. `bumblebee/routers/workflow_runs.py`)
2. Follow the **service call** (`execute_workflow_run`)
3. Read the **orchestrator** (`services/control/orchestrator.py`)
4. Drop into the **harness** (`services/execution/harness.py::run_role`) — this is the heart
5. From harness, follow LLM provider (`services/execution/llm_provider.py`) + tool calls
6. State mutations land in `services/state/event_log.py::append_event`
7. WebSocket broadcasts are automatic via `event_log.py`'s broadcast hook

Everything else hangs off that. The 19-table schema is dense but each table has one job, documented in [database-schema.md](./database-schema.md).
