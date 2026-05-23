# Security Policy

## Reporting a vulnerability

Email `security@bumblebee.example.com` (PGP key on website). DO NOT open a public GitHub issue.

We aim to:
- Acknowledge within 1 business day
- Triage + initial severity assessment within 3 business days
- Ship a fix or workaround within 30 days for high/critical, 90 days for medium

We do not yet operate a bug bounty program. Hall-of-fame credit available on request.

## Data at rest

| Asset | Encryption | Rotation |
|---|---|---|
| Postgres database | TLS in transit, server-side encryption on disk (cloud provider managed) | DB master key annual |
| Backups (S3) | SSE-KMS or GPG-encrypted | Backup key annual |
| Secrets (.env on hosts) | OS file permissions 0600, managed by secrets vault | Per-secret schedule |
| API tokens (JWT) | HS256-signed with `API_SECRET_KEY` | 24h TTL, rotated on logout |
| API keys (REST) | sha256-hashed in DB; raw shown ONCE on issue | Manual rotation via UI |
| User passwords | bcrypt cost factor 12 (truncated to 72 bytes per bcrypt spec) | n/a |

## Data in transit

- All external traffic over TLS 1.2+ (TLS 1.3 preferred)
- WebSocket `/ws` requires auth gate (JWT in query param) — Phase E
- Stripe webhooks require signature verification (`stripe.Webhook.construct_event`)
- MCP HTTP transport requires `Authorization: Bearer <api_key>` — HTTPS in production

## Access controls

- **Multi-tenancy**: every database row scoped to `workspace_id`. RBAC enforced via `require_permission` FastAPI dependencies on every endpoint.
- **Roles**: owner > admin > member > viewer. 21 leaf permissions; see `bumblebee/services/rbac/permissions.py`.
- **Cross-workspace access returns 403**, never 404 (no existence leak).
- **Session lifetime**: JWT 24h, can be invalidated by bumping the user's token version (Phase E-future).
- **API key scope**: tied to issuing user's primary workspace (Phase B-future: per-key workspace picker).

## Code security

- Dependencies pinned via `pyproject.toml`; Dependabot enabled
- Pre-commit secret scanner: recommend `gitleaks` (operator install)
- Prompt Defense Baseline (`bumblebee/prompts/_defense_baseline.yaml`) prepended to every agent prompt — blocks injection, role override, schema bypass
- Tool calls validated against declared JSON Schema before dispatch
- All agent-generated shell commands (`bash_exec`) MUST be sandboxed (Docker/firejail) — not yet enforced in v1 (operator responsibility)

## Network controls

- Postgres bound to internal network only (no public ingress)
- FastAPI behind a TLS-terminating reverse proxy (Caddy / nginx / Cloudflare)
- Stripe webhook endpoint allow-listed by source IP (optional; signature is the primary control)
- MCP HTTP server bound to `127.0.0.1` by default; production uses TLS termination

## Logging + retention

- Audit log: events table append-only, retained indefinitely (operator can prune via SQL)
- App logs: stdout → log aggregator (operator choice). Retain 90 days.
- LLM input/output: not stored separately — only `llm_call` event summary (model, tokens, cost)
- PII: workspace name + member email are PII. Workspace deletion = soft-delete 30 days then hard-delete (GDPR compliant)

## Incident response

See `docs/security/incident-response.md`.

## Compliance posture

- **SOC2 Type 1**: prep complete (this doc + DR + DPA + incident response + SLA). Audit not yet engaged.
- **SOC2 Type 2**: 6-month observation period not started.
- **GDPR**: data-processing addendum template at `docs/security/data-processing-addendum.md`. Right-to-erasure honored via workspace hard-delete.
- **HIPAA / PCI**: NOT compliant. Do not store PHI/PAN in Bumblebee.

## Open questions

- SOC2 vendor: Vanta vs Drata vs DIY — operator decision
- Penetration test cadence: annual via third party (TBD)
- Encryption-at-rest customer-managed keys (CMK) for enterprise tier: Phase F-future
