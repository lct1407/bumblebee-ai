# Changelog

All notable changes to **bumblebee-ai** documented here.

## [Unreleased] — Execution-plane harness refactor

### Changed

- **Harness is now a real agentic loop, built as a LangGraph StateGraph** (`bumblebee/services/execution/agent_loop.py`) — `run_role` finally wires the ToolExecutor it always documented: LLM tool requests (native `LLMResponse.tool_uses` or text protocol `{"tool_call": {"name": ..., "args": {...}}}`) are validated + executed via Plane 6, `ToolResult` summaries are fed back into the prompt, and the model is re-invoked. The loop runs as a compiled graph (`START → safety → invoke → tools → safety …`) matching the Plane 1 control plane's LangGraph idiom, bounded by `BUMBLEBEE_MAX_TOOL_ITERATIONS` (default 5), with per-iteration session-budget + workspace-quota re-checks and the existing tool-call loop detector (which previously could never fire — no `tool_call` events were ever emitted by the harness path). `harness.py` now owns only session lifecycle (start/finalize, output parsing, triager side-effects).
- **Tool catalog rendered into the system prompt** (`context_assembler.py`) — role-filtered tools were attached to `Prompt.tools` but never shown to the model; the assembler now renders name + description + args schema with the text call protocol so providers without native function calling can use tools.
- **Streaming broadcast extracted** to `bumblebee/services/execution/streaming.py` (WebSocket chunk fan-out is an Observability concern, not loop logic). No behavior change.

### Added

- 3 harness tests in `tests/test_integration_real.py`: tool-loop execution end-to-end (tool_call → tool_result → final answer), repeat-detection failure path (`infinite_loop`), tool-catalog rendering in assembled context.

## [Unreleased] — Phase A + B + C + D + E + F + Post-MVP polish

### Phase D — Stripe billing live + quotas

#### Added

- **`POST /api/billing/workspace/{ws}/checkout-session`** — creates Stripe Customer (idempotent), generates Checkout URL for Pro/Team upgrade. Requires `MANAGE_BILLING` permission (owner-only).
- **`GET /api/billing/plans`** — public catalog from `bumblebee.services.billing.plans` with `billing_enabled` flag.
- **`GET /api/billing/workspace/{ws}`** — current plan + spend counter + cap + overdue state.
- **`GET /api/billing/workspace/{ws}/invoices`** — last 12 invoices from Stripe with PDF/hosted URLs.
- **`POST /api/billing/workspace/{ws}/cancel`** — cancel at period end via Subscription.modify.
- **5 webhook handlers** (`bumblebee/routers/stripe_webhooks.py`): `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Each idempotent via in-memory `_PROCESSED` set. On webhook: workspace.plan flips, payment_overdue toggled, period counter resets on invoice.paid, audit event appended.
- **`bumblebee/services/billing/quota.py`** — `check_workspace_quota(db, ws_id)` (raises `QuotaExceeded` for overdue / cap reached) + `record_usage(db, ws_id, cost_usd)` (increments period counter + reports Stripe metered usage for Team plan via `SubscriptionItem.create_usage_record` with idempotency key).
- **Harness integration** (`bumblebee/services/execution/harness.py`) — quota check runs BEFORE LLM call, fails session with `BUDGET_EXCEEDED` + `upgrade_required: true` flag if exceeded. After successful LLM call, `record_usage()` increments period spend + pushes Stripe metered usage for Team plan.
- **Auto-rolling 30-day periods** — `_maybe_reset_period()` resets the spend counter when 30+ days have passed since `period_started_at`. Idempotent.
- **Web `/settings/billing` page** — plan banner, live usage meter (color-shifts green→amber→red at 70/90% cap), upgrade cards for Pro/Team with Checkout button, invoice table with PDF links, cancel-at-period-end button (owner only). Handles `?status=success/cancel` from Checkout return.
- **Web `billing-api.ts`** — typed client for all 5 billing endpoints.
- **11 new tests** in `tests/test_billing_phase_d.py` — covers public plans, billing state, cross-workspace 403, member RBAC, quota pass/raise/cap/overdue, period reset, empty invoices, **live Checkout session creation against Stripe test mode** (verified returns `cs_test_*` session URL).

#### Stripe test mode wired

- Products + Prices created in user's Stripe test account via `scripts/stripe-setup-catalog.py`:
  - `prod_UZ0v6gTmVibyd0` (Pro) → `price_1TZstH08yAdskQyO1R58dBc0` ($20/mo)
  - `prod_UZ0v3rFgVCPy6S` (Team) → `price_1TZstI08yAdskQyOlbnnNo3W` ($100/mo) + `price_1TZstJ08yAdskQyOSb02iuUo` (metered usage)
- `BILLING_ENABLED=true` in dev `.env`, secret + publishable test keys configured.
- `STRIPE_WEBHOOK_SECRET` pending: operator runs `stripe listen --forward-to localhost:8000/api/stripe/webhook` in dev, copies the printed secret to `.env`.

#### Conftest fix

- `clean_db` now resets `payment_overdue`, `payment_overdue_since`, `llm_spend_cents_this_period`, `plan=free` on the seed workspace to prevent state leak between tests.

## [Unreleased] — Phase A + B + C + E + F + Post-MVP polish + Stripe scaffolding

### Post-MVP polish (closes A/E frontend deliverables)

#### Added (web)

- **`/settings/workspace`** — current workspace inspector + rename (admin+) + danger-zone soft-delete (owner only, requires slug-confirm typing). Reads role from JWT.
- **`/settings/members`** — member list with avatar, joined date, inline role selector (admin+), remove button (admin+, owner immune). Invite form with email + role dropdown; on send displays the shareable invite link as fallback for email delivery.
- **`/settings/` shared layout** — sidebar nav (Workspace · Members · API keys · Billing) with `layoutId` active indicator.
- **`<WhatsNewModal>`** in app shell — fires on first dashboard mount after a new version ships. Reads `/api/changelog/latest`, persists `bumblebee.whatsNew.lastSeen` per-user in localStorage. Renders up to 5 sections × 8 bullets, more-indicator if truncated.
- **`web/src/lib/changelog-api.ts`** — `ChangelogApi.list/latest` client.

#### Fixed

- **Changelog parser** (`bumblebee/routers/changelog.py`) — `##` regex was matching `###` headings too, causing sections to be missed. Added `(?!#)` lookahead on both `HEADING_RE` and `SECTION_RE`. Also fixed `[Unreleased]` capture being truncated to "U" — switched to explicit `\[([^\]]+)\]|(\S+)` alternation with greedy match.

### Phase F — Onboarding + pricing

#### Added (web)

- **`/pricing` public page** — 3-tier card layout (Free / Pro highlighted / Team), full feature comparison, 6 FAQ accordions, Lighthouse-friendly (no animation on first paint). Sign-in + self-host instructions in footer.
- **`/onboard` 4-step wizard** — (1) create workspace, (2) invite team with chip-input, (3) pick from 5 issue templates + customize title, (4) confirmation with next-action button. Progress dots, animated step transitions, skip path at every step. Force-dynamic rendering with Suspense wrapper for `useSearchParams()` (`?plan=pro` triggers Checkout step instead of dashboard).
- **5 issue templates** in `web/src/lib/issue-templates.ts` — fix-bug (with reproduction sections), add-feature (acceptance criteria checklist), refactor, investigate (spike with time-box), blank.
- **Pricing-page CTAs** link to `/register?plan=<tier>` for paid plans → routes through onboarding → ends at billing checkout (Phase D wires the final hop).

#### Deferred to Phase F-future

- Inline first-issue tour (tooltip walkthrough) — basic onboarding flow is enough for v1
- Empty-state CTA audit across all dashboard/issues/notifications pages — components already have `action` prop, content sweep TBD
- Funnel analytics events (Posthog/Plausible) — needs operator decision on vendor

### Phase E — Audit + changelog + WS auth + DR + SOC2-prep

### Phase E — Audit + changelog + WS auth + DR + SOC2-prep

#### Security

- **WebSocket auth gate** (`/ws?project=X&token=<JWT>` or `&api_key=<key>`) — closes the known unauthenticated-WS vulnerability. Cross-workspace connect returns close code 4003 (never 4004 — no existence leak).
- **5 security docs** in `docs/security/`: security-policy.md (reporting, encryption, access controls), incident-response.md (severity ladder, runbooks), sla.md (99.5/99.9 uptime + credits), data-processing-addendum.md (GDPR template), data-retention.md (per-category retention table + erasure flow).

#### Added

- **Field-level events** on PATCH `/api/projects/{slug}/issues/{number}` — every changed field (status / priority / type / title / description / complexity / scope_hints / acceptance_criteria / ai_summary) emits a `field_changed` event with `{field, from, to}` payload. No-op PATCH is detected and skipped (audit log stays clean).
- **`GET /api/audit/events.json`** — cursor-paginated filtered audit query (actor / type / issue_id / session_id / source / since / until). Workspace-scoped, requires `READ_AUDIT_LOG` permission.
- **`GET /api/audit/events.csv`** — streaming CSV export (server-side cursor, memory-bounded). Requires `EXPORT_AUDIT_LOG` permission.
- **`GET /api/changelog`** + **`/latest`** + **`/reload`** — exposes parsed CHANGELOG.md as JSON for the web UI "What's new" modal. Cached, hot-reload after release.
- **`scripts/release.py`** — bumps version (patch/minor/major), aggregates conv-commits since last tag, drafts a CHANGELOG stanza (opens `$EDITOR`), writes `pyproject.toml` + `bumblebee/__init__.py` + `web/package.json`, creates git tag. `--dry-run` mode for safety.
- **`scripts/backup.sh`** — `pg_dump` → gzip → optional GPG → S3 or local. 30-day local retention. Cron-friendly.
- **`scripts/restore.sh`** — interactive restore with database-name confirmation prompt. Handles `.sql.gz` + `.sql.gz.gpg`.
- **`docs/disaster-recovery.md`** — RTO 4h / RPO 1h objectives, scheduled backup, restore procedure, quarterly DR test checklist, common failure scenarios.
- **8 new tests** in `tests/test_audit_and_ws_auth.py` — covers audit list/CSV/filter, changelog endpoint, field-level events on PATCH, no-op skip, unauth 401.

### Phase C — ECC adoption + eval harness (CLI-only)

### Phase C — ECC adoption + eval harness (CLI-only)

#### Added

- **11 externalized agent prompts** in `bumblebee/prompts/*.yaml` (one per role): triager, coordinator, planner, implementer, tester, reviewer, integrator, merger, documenter, assistant, failure_diagnostician. Each declares: `system` text, `output_schema` (JSON Schema Draft 2020-12), `tools_allowed`, `budgets`. Triager includes 2 few-shot examples.
- **Prompt Defense Baseline** (`bumblebee/prompts/_defense_baseline.yaml`) — version-stamped, prepended to every assembled prompt. Blocks system-prompt extraction, role overrides, schema bypass, workspace cross-tenant probes.
- **Prompt loader + cache** (`bumblebee/prompts/loader.py`) — YAML reader, `Prompt` + `DefenseBaseline` dataclasses, `assemble_system_prompt(role)`, hot-reload via `reload()`.
- **Prompt validator** (`bumblebee/prompts/validator.py`) — 3 passes (structural, few-shot schema match via jsonschema, assembled prompt sanity). Zero LLM cost. Exits 1 on any error.
- **`bb eval prompts`** CLI command — runs the validator. Use in CI.
- **`bb eval list-roles`** CLI command — Rich table of all roles with budgets + tool counts.
- **CI workflow** `.github/workflows/prompt-validator.yml` — runs on every PR touching `bumblebee/prompts/**`. Fast, deterministic, free.
- **`context_assembler` rewired** — now prefers YAML prompts over inline `AgentDefinition.prompt_template`. Falls back to DB for legacy roles without YAML. Output schema appended to system prompt as a JSON code block so the LLM has explicit format spec.
- **8 new tests** in `tests/test_prompts_validator.py` covering: loads all 10+ roles, baseline substantive, every assembled prompt starts with baseline, validator passes clean, every role has output_schema + budgets, few-shot examples validate, assembled prompt size sane.

#### Deferred to Phase C-future (v1.1)

- Skill registry expansion from 12 → 15 tools (`web_search`, `web_fetch`, `db_query`)
- LLM-backed scoring (currently only schema validation; LLM-as-judge nightly run TBD)
- Eval dashboard UI (cut from v1 per brainstorm)
- 200 golden scenarios (currently 2 examples in triager.yaml; expand via real-prod-log sampling)

### Phase B — MCP Server (multi-tenant)

### Phase B — MCP Server (multi-tenant)

#### Added

- **`bumblebee_mcp` package** — separate from the FastAPI app, ships as a sub-module of `bumblebee-ai`.
- **5 MCP tools** exposed via stdio + Streamable HTTP transports:
  - `bumblebee_list_issues` (filters: status, type, priority, limit)
  - `bumblebee_get_issue` (by per-project number)
  - `bumblebee_create_issue` (auto-picks first project if `project_slug` omitted)
  - `bumblebee_trigger_workflow` (starts workflow run)
  - `bumblebee_get_events` (workspace-scoped or per-issue)
- **`bb mcp serve`** CLI command — `--transport stdio` (Claude Desktop) or `--transport http --port N` (Claude Code / Cursor).
- **API key → workspace + role** resolution (`bumblebee_mcp.auth.resolve_api_key`) — every tool call runs through the existing RBAC permission gate.
- **Cross-workspace isolation** — tool dispatch SQL queries always include `WHERE workspace_id = ctx.workspace_id`; verified with test.
- **`docs/mcp-integration.md`** — operator guide for Claude Desktop + Claude Code wire-up, JSON examples, security notes.
- **11 new tests** in `tests/test_mcp_server.py` covering tool registry, dispatch, RBAC gates, cross-workspace isolation, unknown-tool 400.

#### MCP transport details

- stdio uses `BUMBLEBEE_API_KEY` env var (single key per client session)
- HTTP uses `Authorization: Bearer <api_key>` per request (multi-tenant friendly)
- Tool inputs validated against declared JSON schema before dispatch
- All errors return structured JSON (no stack traces leaked)

#### Future work (Phase B-final)

- API key rotation UI in `/settings/api-keys`
- Per-key scope picker (current keys inherit user's primary workspace; needs `api_keys.workspace_id` column)
- `mcp_tool_called` audit events on every dispatch
- Rate limit: 100 req/min per key (currently uncapped)
- Tool result truncation > 32KB

### Stripe scaffolding (parallel track inside Phase A)

#### Added

- `stripe` SDK installed (pinned API version `2024-12-18.acacia`).
- `bumblebee.services.billing` package — `stripe_client` with configuration gate (`is_configured()`, `StripeNotConfigured`), `plans` catalog (Free / Pro $20 / Team $100 + LLM passthrough).
- `POST /api/stripe/webhook` endpoint with signature verification — handlers are NO-OPs in Phase A (filled by Phase D).
- `scripts/stripe-setup-catalog.py` — idempotent Products + Prices creator. Run once with test key to populate Stripe Dashboard.
- `docs/stripe-integration.md` — operator guide for test + production setup, key rotation safety.
- `.env` template extended with 6 Stripe config keys + `BILLING_ENABLED=false` master switch.

#### Security note

- Live Stripe API calls are gated by `BILLING_ENABLED=true` AND `STRIPE_SECRET_KEY` set. Both default to off — no risk of accidental charges in dev.

## [Unreleased] — Phase A: Workspace tenancy + RBAC

### Added

- **Workspace model** (`workspaces` + `workspace_members` + `workspace_invites`) — top-level multi-tenant boundary. Roles: owner / admin / member / viewer. Owner-managed, soft-deletable, billable (Stripe columns reserved for Phase D).
- **`WorkspaceScopedMixin`** mixed into 13 tenant-scoped models: projects, issues, events, agent_sessions, workflows, workflow_runs, knowledge_entries, chat_sessions, notifications, scope_leases, comments, agent_definitions, skills. NOT NULL `workspace_id` enforced.
- **Permission catalog** (`bumblebee.services.rbac.permissions`) — 21 leaf permissions bundled into 4 roles. Endpoints declare permissions, not roles.
- **FastAPI deps** — `require_workspace`, `require_permission`, `require_role`. JWT carries `ws` + `role` claims.
- **Workspace router** — `/api/workspaces` (CRUD + delete-soft 30d), `/api/workspaces/{id}/members` (list/role-change/kick), `/api/workspaces/{id}/invites` + `/api/invites/{token}/accept` (7-day TTL, single-use).
- **Auth flow** — `POST /api/auth/register` auto-creates a workspace + owner membership. `POST /api/auth/login` resolves the user's primary workspace. `GET /api/auth/me` returns user's workspaces list.
- **Auto-scope listeners** (`bumblebee.services.rbac.auto_scope`) — SQLAlchemy `before_insert` hooks that auto-fill `workspace_id` from parent rows (issue → workspace, agent_session → issue.workspace, etc.) so internal services don't need to thread the scope manually. Last-resort fallback to first workspace for top-level entities (Project, Workflow, AgentDefinition, Skill, KnowledgeEntry).
- **Stripe scaffolding columns** on `workspaces`: `plan` (free/pro/team enum), `stripe_customer_id`, `stripe_subscription_id`, `llm_spend_cents_this_period`, `period_started_at`, `payment_overdue`, `payment_overdue_since`, `settings` JSONB.

### Changed

- **JWT payload** now includes `ws` (workspace UUID) + `role` claims in addition to `sub` + `username`.
- **`POST /api/auth/register`** now accepts optional `workspace_name` field; auto-generates slug if omitted.
- **`bumblebee.main`** registers auto-scope listeners at import time.
- **`tests/conftest.py`** seeds workspace/user/project shell + inlines workflow/agent_def/knowledge seeding (replaces the legacy `seed_default.seed()` call which caused event-loop conflicts under sequential pytest runs).

### Migrations

- `20260525_0001_workspace_tenancy.py` — creates 3 workspace tables, 2 enums, adds `workspace_id` FK + index to 14 tables, backfills existing rows into a "Default" workspace owned by the first user. Reversible.

### Tests

- 103/106 passing (was 63 before Phase A). 3 remaining failures are pre-existing plugin-loader tests that require `bumblebee-plugin-example` pip-installed.
- New `tests/test_workspaces_rbac.py` — 10 tests covering register-creates-workspace, JWT ws/role claims, list/create/update workspace, invite flow, owner-cannot-self-remove, owner-role-not-invitable, /me returns memberships, non-member 403 (never 404), invalid invite 404.

### Security notes

- Cross-workspace access returns 403 (never 404) — does not leak workspace existence.
- Invite tokens 32-byte url-safe random, single-use, 7-day TTL.
- Workspace slug user-input sanitized via `_slugify` (lowercase alphanumerics + hyphens only).
- Workspace owner cannot be removed via `DELETE /members/{id}` — only via future ownership transfer.

### Not yet (Phase A future work)

- **Workspace switcher UI** in sidebar (TODO).
- **Settings pages** at `/settings/workspace`, `/settings/members` (TODO).
- **Ownership transfer** endpoint (deferred — owner-only edge case).
- **Daily quota period-reset cron** (Phase D).
- **WS auth gate** at `/ws?project=X` (Phase E).

## [0.3.0] — 2026-05-19 (rc1)

### Added

- **Greenfield v3 platform** — multi-agent concurrent task management with 7-plane architecture
- **Workflow engine** — LangGraph + YAML declarative workflow loader
- **Event log** — append-only canonical state (`events` table)
- **ScopeLease** — atomic file-glob claim for multi-agent concurrent execution
- **Tool registry** — 13 single-verb tools with strict JSON schema validation + role filtering
- **Tool executor** — dispatcher with `ToolResult` schema (status/summary/next_actions/artifacts)
- **ContextAssembler** — Prompt Defense Baseline + role prompt + Skills + Knowledge + IssueMemory
- **LLM provider abstraction** — stub + claude-cli; OpenAI/Gemini stubs ready
- **Safety plane** — BudgetEnforcer (3 scopes), LoopDetector, FailureClassifier, MitigationActuator
- **Plugin system** — Python `entry_points` discovery; `bumblebee-plugin-example` reference plugin
- **Coordinator** — Phase 4 multi-specialist decomposition + dispatch
- **Notifications** — first-class entity with dispatcher + REST endpoints
- **Replay debugger** — event log → reconstructed trace
- **Eval harness** — agent-eval YAML schema + pytest/grep/regex/exit_code judges + pass@k runner
- **OTel trace emitter** — observability scaffold
- **CLI** — `bumblebee` console script: init / db / server / plugins / issue / chat / replay
- **Database** — 14 entities + plugin_registrations; Alembic migrations
- **Tests** — 75 passing across 11 test modules

### Distribution

- pypi package name: **`bumblebee-ai`** (`bumblebee` was abandoned 2011 lib; PEP 541 takeover pending)
- npm scope reserved: `@bumblebee` (TS extensions Phase 6+)

### Documentation

- [Architecture](docs/architecture.md) — 7-plane reference
- [Plan](docs/plan.md) — full design (v1.1.1 locked)
- [Getting started](docs/getting-started.md) — install + first run
- [Phases status](docs/phases-status.md) — per-phase progress tracking

### Anti-scope

- Vector DB / embeddings (2026 standards confirm structured + BM25 default)
- Mobile app, embeddable widget
- ChatSession Tier 3 (orchestration control surface)
- Multi-tenancy
- Plugin marketplace, sandboxing, signing

### Known limitations (planned post-rc1)

- claude-cli execution requires real binary + API key (stub fallback in tests)
- LangGraph multi-node traversal scaffolded; full workflow execution in Phase 1.5+
- Next.js web UI deferred to Phase 4 implementation cycle
- ECC content vendor (10 agent prompts + 15 skills) deferred to Phase 6 execution
- TestPyPI smoke test on 3 OS pending CI runner setup

## [Pre-history]

- 2026-05-12 — Go-based `bumblebee` rebuild attempt (separate repo `lct1407/bumblebee`)
- 2026-02-27 — Bumblebee v2 release candidate (current `Bumblebee-cli`)
