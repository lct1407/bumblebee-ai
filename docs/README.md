# Bumblebee documentation

This folder is the table of contents. Each link below points to a focused doc.

> **Single repo.** Production code, docs, plans — everything lives in this folder (`D:/Source/bumblebee/`, repo `lct1407/bumblebee-ai`). The old `Bumblebee-cli` repo was merged into here on 2026-05-22 and archived.

## Start here

If you're brand new, read in this order:

1. [**Architecture overview**](./architecture-overview.md) — *what is Bumblebee, how do the pieces fit, how does it map to "AI agent framework" concepts (Agent, Context, Harness, Model)*. Beginner-friendly with analogies.
2. **Getting started guide** — *step-by-step user walkthrough with screenshots*: landing → register → onboarding → first issue → trigger workflow.
   - 🇬🇧 [English](./getting-started-guide.md)
   - 🇻🇳 [Tiếng Việt](./getting-started-guide-vi.md)
3. [**Source layout**](./source-layout.md) — *what each subfolder does* (backend / web / MCP / tests / plans).
4. [**Database schema**](./database-schema.md) — *every table, every relationship, why each exists*.
5. [**Flow walkthroughs**](./flow-walkthroughs.md) — *what happens end-to-end* when a user creates an issue, triggers a workflow, an agent runs, billing fires, etc.

## Reference by audience

### For new users
- 🇬🇧 [Getting started guide](./getting-started-guide.md) — full UI walkthrough
- 🇻🇳 [Hướng dẫn bắt đầu](./getting-started-guide-vi.md) — bản tiếng Việt
- [Pricing & billing](./billing.md) *(TBD — for now see [/pricing](http://localhost:3000/pricing) in app)*

### For operators (self-host or run the SaaS)
- [Disaster recovery](./disaster-recovery.md) — backup, restore, RTO/RPO
- [Security policy](./security/security-policy.md) — encryption, access, incident reporting
- [Incident response](./security/incident-response.md) — severity ladder, runbooks
- [SLA](./security/sla.md) — uptime commitments, credits
- [Data retention](./security/data-retention.md) — retention table, GDPR erasure
- [Data processing addendum](./security/data-processing-addendum.md) — GDPR template
- [Stripe integration](./stripe-integration.md) — test/live setup
- [Google OAuth setup](./security/google-oauth-setup.md) — wire "Sign in with Google"

### For developers
- [Architecture overview](./architecture-overview.md) — system design + framework mapping
- [Database schema](./database-schema.md) — entity reference
- [Flow walkthroughs](./flow-walkthroughs.md) — sequence diagrams in prose
- [API reference](./api-reference.md) — REST endpoint catalog *(generated from FastAPI)*
- [Streaming architecture](./streaming-architecture.md) — live agent output pipeline
- [MCP integration](./mcp-integration.md) — wire Claude Code / Desktop / Cursor
- [Design system](./design-system.md) — frontend tokens, components, theme

### For prompt engineers
- [Agent prompts catalog](../bumblebee/prompts/) — YAML files for 11 agent roles
- [Knowledge / conventions](./knowledge.md) — what the agents are told about the codebase

## Quick reference

| If you want to… | Read |
|---|---|
| Understand what Bumblebee IS | [architecture-overview.md](./architecture-overview.md) |
| Sign up + run your first workflow | [getting-started-guide.md](./getting-started-guide.md) |
| Know what tables exist + why | [database-schema.md](./database-schema.md) |
| Trace a request through the system | [flow-walkthroughs.md](./flow-walkthroughs.md) |
| Wire it into Claude Code | [mcp-integration.md](./mcp-integration.md) |
| Set up backups | [disaster-recovery.md](./disaster-recovery.md) |
| Brand the UI | [design-system.md](./design-system.md) |
| Talk to legal/security customers | [security/](./security/) |
