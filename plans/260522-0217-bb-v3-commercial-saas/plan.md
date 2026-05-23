---
name: bb-v3-commercial-saas
status: pending
created: 2026-05-22
target_repo: D:/Source/bumblebee-v3
blockedBy: []
blocks: []
related_plans:
  - 260518-2010-bb-v3-multi-agent-concurrent  # v3 core engine (mostly shipped)
brainstorm_source: plans/reports/brainstormer-260522-0217-bb-v3-commercial-gaps.md
total_effort: 12 weeks (1 engineer) / 6-7 weeks (2 engineers parallel)
---

# Bumblebee v3 — Commercial SaaS upgrade

Transform v3 from "engineering core complete" to "commercial SaaS shippable". Foundation-first sequencing: tenancy + RBAC before everything else, then MCP distribution, ECC standards, billing, audit, polish.

## Locked decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Commercial model | **SaaS multi-tenant (Bumblebee Cloud)** |
| Agent-framework standard | **Both: MCP server layered on LangGraph core** |
| Upgrade tracking | CHANGELOG.md + git tags + GitHub releases + field-level events + in-app "What's new" |
| Sequencing | **Foundation-first (A→B→C→D→E→F)** — no retrofit |
| Stripe ordering | Scaffolds in parallel from week 1; live subscriptions in Phase D |
| Cuts from v1 | OTel spans, agent-eval dashboard UI (CLI runner kept) |

## Phase index

| Phase | Weeks | File | Status |
|---|---|---|---|
| A · Tenancy + RBAC | 1-3 | [phase-a-tenancy-rbac.md](phase-a-tenancy-rbac.md) | pending |
| (parallel) Stripe scaffolding | 1-2 | folded into Phase A | pending |
| B · MCP server (multi-tenant) | 4-5 | [phase-b-mcp-server.md](phase-b-mcp-server.md) | pending |
| C · ECC + eval harness (CLI-only) | 6-7 | [phase-c-ecc-evals.md](phase-c-ecc-evals.md) | pending |
| D · Stripe billing + quotas | 8-9 | [phase-d-stripe-billing.md](phase-d-stripe-billing.md) | pending |
| E · Audit + changelog + WS auth + DR + SOC2 | 10-11 | [phase-e-audit-changelog-soc2.md](phase-e-audit-changelog-soc2.md) | pending |
| F · Onboarding + pricing | 12 | [phase-f-onboarding-pricing.md](phase-f-onboarding-pricing.md) | pending |

## Critical dependencies

```
A (tenancy+RBAC) ─┬─► B (MCP) ─► C (ECC) ─► D (billing) ─► E (audit) ─► F (polish)
                  │
                  └─► Stripe scaffolding (parallel, weeks 1-2)
```

## Success metrics (from brainstorm §6)

- First MCP integration usable in Claude Code by week 6
- First paying customer week 10
- Agent-eval pass-rate ≥80% on golden dataset (CI gate)
- Onboarding completion ≥60% within 24h of signup
- WS auth gate closed by week 11
- Audit log queryable + CSV exportable by week 11
- Backup runbook executed E2E on staging by week 11

## Risks

| Risk | Mitigation |
|---|---|
| 12-week solo slips | Parallelize A + Stripe scaffolding (~1 engineer-week saved) |
| Stripe Checkout edge cases (dunning, refunds) | Use hosted Checkout, defer self-serve cancellation to v1.1 |
| MCP SDK churns | Pin version, rev on ecosystem stabilize |
| WS auth gate breaks Tauri/CLI daemon | JWT via `?token=` query; daemon already has API key |
| ECC prompt externalization regresses agents | Block on golden-dataset CI gate |

## Unresolved (decide in-phase)

- Pricing tiers — flat $/user vs usage-based vs hybrid → settle Phase D week 8
- MCP transport — Streamable HTTP default, stdio for Claude Desktop local
- SOC2 vendor — Vanta / Drata / DIY → decide before Phase E
- Workspace deletion — soft 30d → hard (GDPR compliant)

## Next steps after this plan

1. User provides Stripe API key (test mode) → plumb into `.env`
2. Phase A kicks off: `workspace` model + alembic migration
3. Stripe scaffolding parallel track starts same week (catalog setup via Stripe Dashboard CLI)
4. After Phase F: `/ck:journal` retro entry + GitHub release v1.0
