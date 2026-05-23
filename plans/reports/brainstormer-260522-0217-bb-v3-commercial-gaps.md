# Bumblebee v3 — Commercial-readiness audit & gap-closure plan

**Date:** 2026-05-22
**Subject:** Evaluate v3 against 2026 AI-Agent-framework standard · audit upgrade tracking · identify gaps to commercial SaaS
**Decision:** Foundation-first 12-week sequencing · SaaS multi-tenant · MCP-on-LangGraph · OTel + eval UI cut from v1

## 1. Problem statement

User requirements:
- Confirm Bumblebee v3 matches "AI Agent framework" expectations
- Audit whether upgrades / behavioural changes are logged
- Enumerate what's still needed for commercial SaaS
- Verify scope alignment

The honest verdict given upfront in the brainstorm: **the engineering core is in spec, the SaaS shell is not**.

## 2. Current state

### Architecture conformance — what's actually there

| 7-plane component | Status | Notes |
|---|---|---|
| Control (LangGraph orchestrator) | ✅ Built | `services/control/` |
| Dispatch (PG SKIP LOCKED + ScopeLease) | ✅ Built | `services/dispatch/` |
| Execution (Harness + ClaudeCLIProvider) | ✅ Streaming wired this session | NDJSON → WS pipeline shipped |
| State (append-only event log) | ✅ Built + auto-broadcasts WS | `state/event_log.py` |
| Safety (Budget / Loop / Failure / Mitigation) | ✅ All four built | `services/safety/` |
| Tool registry | ✅ Built | `services/tool/` |
| Observability | ⚠️ `obs/` dir exists, no OTel spans on prod paths |
| Memory tiers (Knowledge, IssueMemory) | ✅ Built | `services/knowledge/`, `state/issue_memory.py` |
| Plugin system (entry_points) | ✅ Built | `services/plugins/` |
| Streaming (CLI → WS → live UI) | ✅ Shipped this session | `docs/streaming-architecture.md` |
| Web UI (Linear-style, tokens, dark mode, full issue mgmt) | ✅ Production-grade | `web/` |

### Upgrade tracking — what's logged today

| Layer | Tracked | Where |
|---|---|---|
| Code | ✅ git log + `CHANGELOG.md` exists | `bumblebee-v3/CHANGELOG.md` |
| Schema | ✅ alembic versions | `alembic/versions/` |
| Runtime events | ✅ append-only `events` table + WS broadcast | persistent + ephemeral |
| Field-level issue mutations | ❌ silent | PATCH `/issues` doesn't emit |
| Release journal | ❌ none | `/ck:journal` never invoked |
| Per-session replay | ⚠️ router exists, UI doesn't surface |
| In-app "what's new" | ❌ none | `CHANGELOG.md` not exposed |
| Cost ledger / invoice | ⚠️ partial | `cost_charged` events exist; no aggregate |

## 3. Commercial gaps — what's missing for SaaS v1

| Gap | Severity | Why |
|---|---|---|
| **MCP server** | 🔴 | Anthropic 2026 standard. Claude Code / Desktop / Cursor expect MCP. |
| **Multi-tenancy** (`workspace_id` on all tables) | 🔴 | Cannot ship SaaS without it. |
| **RBAC** (owner / admin / member / viewer) | 🔴 | Single admin user only. |
| **Billing + quotas** (Stripe) | 🔴 | No revenue mechanism. |
| **ECC adoption** (ToolResult + Prompt Defense + agent-eval YAML) | 🟡 | Flagged pending in original v2 CLAUDE.md. |
| **Audit log UI** (filter / export) | 🟡 | Events table complete; UI doesn't surface for compliance. |
| **Field-level event on PATCH /issues** | 🟡 | Silent today. Activity tab can't show "X changed priority". |
| **WS auth gate** | 🟡 | `/ws?project=X` accepts unauthenticated clients. |
| **Backup / DR runbook** | 🟠 | No PG dump/restore docs. |
| **Onboarding flow** | 🟠 | Land on cold dashboard. |
| **Pricing page + Stripe Checkout** | 🟠 | Marketing landing exists, no "Buy" path. |
| **SOC2-prep docs** (security policy, DPA template) | 🟠 | Required for enterprise sales. |
| **SLA/SLO definition** | 🟠 | No measured uptime + error budget. |
| **Status page** | 🟠 | No public uptime indicator. |

## 4. Approach — sequencing & scope

Three sequencings debated:

| Option | First $$$ | First MCP | Tech debt | Verdict |
|---|---|---|---|---|
| Revenue-first (Stripe first on single-WS shim) | week 2 | week 7 | High (retrofit billing onto multi-WS) | Rejected |
| Distribution-first (MCP first, no RBAC) | week 9 | week 2 | Medium (MCP tools leak across users until RBAC) | Rejected |
| **Foundation-first (RBAC → MCP → ECC → billing → audit)** | **week 9** | **week 5** | **None** | **Chosen** |

### Locked plan — 12 weeks, foundation-first

| Phase | Weeks | Scope |
|---|---|---|
| **A. Tenancy + RBAC** | 1-3 | Workspace/org_id everywhere · JWT carries workspace claim · roles owner/admin/member/viewer · workspace settings + member invites · per-project ACLs |
| **B. MCP server (multi-tenant)** | 4-5 | `bumblebee-mcp` exposes `list_issues / create_issue / trigger_workflow / get_events / get_runs` · auth via API key scoped to workspace · `bb mcp serve` CLI · Claude Code + Desktop integration docs |
| **C. ECC + eval harness (CLI-only)** | 6-7 | ToolResult schema · Prompt Defense Baseline in `context_assembler` · agent-eval YAML runner + golden dataset · CI gate. NO dashboard UI in v1. |
| **D. Billing + quotas** | 8-9 | Stripe Checkout · subscription tiers · per-workspace $/month + LLM cost passthrough · monthly quota reset · invoice export |
| **E. Audit + changelog discipline** | 10-11 | Audit log UI (filter actor/action/resource, CSV export) · field-level events on PATCH `/issues` · `scripts/release.py` (bump version → stanza from commits → git tag → GitHub release) · `/api/changelog` + in-app "What's new" modal · WS JWT gate · backup/DR runbook · security policy + DPA template + SLA/SLO doc |
| **F. Polish** | 12 | Onboarding wizard (create-workspace → invite team → first-issue tour) · pricing page · Stripe Checkout UI |

### Scope cuts from v1

- **OTel spans** — `events` table is enough audit for v1. Add OTel when scaling beyond single-process.
- **Agent-eval dashboard UI** — keep the CLI runner + CI gate. Build the pass-rate dashboard in v1.1.

Both cuts save ~6 days; quality of the SaaS surface is unaffected.

### Decision: upgrade tracking mechanisms (user chose 3 of 4)

| Mechanism | In v1 |
|---|---|
| `CHANGELOG.md` per release + git tags + GitHub releases | ✅ Phase E |
| Field-level event log on every issue mutation | ✅ Phase E |
| In-app "What's new" surfaced from CHANGELOG | ✅ Phase E |
| `/ck:journal` entries after meaningful changes | ❌ skipped |

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| 12-week solo timeline slips | Two engineers running A in parallel with prep work on B docs; cuts to 7-8 weeks |
| Stripe integration drags (refund / dunning edge cases) | Use Stripe Checkout (hosted) not Elements; defer self-serve cancellation to v1.1 |
| MCP protocol churns (still evolving 2026) | Pin to a specific MCP SDK version; rev when ecosystem stabilises |
| Workspace migration breaks existing seed/test data | Write reversible alembic migration; bb has 7 issues today, low risk |
| ECC prompt externalization regresses agent behaviour | Block on golden-dataset CI gate — no merge if pass-rate drops |
| WS auth gate breaks Tauri/CLI daemon | Pass JWT via query param `?token=` on connect; daemon clients already have an API key |

## 6. Success metrics

| Metric | v1 target |
|---|---|
| First paying customer | Week 10 (after Phase D) |
| First MCP integration (external user uses Bumblebee as Claude Code tool) | Week 6 |
| Agent-eval pass-rate (CI gate) | ≥ 80% on golden dataset |
| Onboarding completion (workspace + 1 issue + 1 trigger) | ≥ 60% of signups within 24h |
| Audit log queryable + exportable | Week 11 |
| WS auth gate closes the open vulnerability | Week 11 |
| Backup runbook tested end-to-end on staging | Week 11 |

## 7. Next steps

1. ✅ Get user approval on this plan
2. Spin into `/ck:plan` to break each phase into concrete tasks with dependencies + file-level deltas
3. Run `scripts/release.py` skeleton + write the first proper `CHANGELOG.md` stanza covering the design-system + streaming + issue-management work done this session — anchors the discipline immediately
4. Phase A kicks off with the `workspace` model + alembic migration

## 8. Unresolved questions

- Pricing tiers — flat $20/mo per user vs usage-based (LLM cost × markup) vs hybrid? Settle in Phase D week 8.
- MCP transport — Streamable HTTP (Anthropic's new default) vs WebSocket vs stdio? Default to Streamable HTTP, allow stdio for local Claude Desktop.
- SOC2 vendor — Vanta / Drata / DIY? Decide before Phase E so policy docs match their templates.
- Workspace deletion — soft delete + 30-day recovery, or hard delete? GDPR requires hard within 30 days of request. Default: soft 30d → hard.
