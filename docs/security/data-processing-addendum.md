# Data Processing Addendum (template)

For customers subject to GDPR / UK GDPR / CCPA / equivalent privacy laws.

> This is a TEMPLATE. Have your legal counsel review before signing. See `docs/security/security-policy.md` for the underlying controls.

## 1. Parties

- **Controller**: the Customer (the entity to whom Bumblebee Cloud is provisioned)
- **Processor**: Bumblebee, Inc. (or your operating entity name)

## 2. Subject matter + duration

Processor processes Customer's Personal Data to provide the Bumblebee Cloud SaaS service, for the duration of the Subscription Term and a 90-day grace period thereafter.

## 3. Nature + purpose of processing

| Activity | Purpose | Legal basis |
|---|---|---|
| Store workspace + member + invite records | Operate the Service | Contract |
| Store issue titles, descriptions, comments | Operate the Service | Contract |
| Store LLM call audit (model, tokens, cost) | Billing + compliance | Contract + legitimate interest |
| Forward email invites via transactional email vendor | Workspace collaboration | Contract |
| Store Stripe Customer ID + Subscription ID | Billing | Contract |

## 4. Categories of data + data subjects

- **Data subjects**: Customer's authorized users (workspace members)
- **Data categories**:
  - Identifiers: email, username, display name
  - Authentication: hashed password (bcrypt), API key hashes, JWT secret
  - Content: workspace contents (issues, comments, knowledge entries)
  - Usage: event log (timestamps, actions, costs)
  - Billing: Stripe Customer ID (no card data — Stripe holds that)

## 5. Sub-processors

| Vendor | Purpose | Region |
|---|---|---|
| AWS | Infrastructure (compute + storage) | us-east-1 / eu-west-1 |
| Stripe | Payment processing | US / EU |
| Anthropic | LLM provider (claude-cli) | US |
| (transactional email vendor) | Invite emails | TBD |
| (status page vendor) | Public uptime page | TBD |

Bumblebee provides 30 days notice before adding/changing sub-processors.

## 6. Security measures

See `docs/security/security-policy.md`. Highlights:
- TLS 1.2+ in transit, SSE-KMS at rest
- bcrypt cost 12 for passwords; sha256 for API key fingerprints
- Workspace-scoped row-level isolation; cross-tenant requests 403
- Audit log retained for the Subscription Term
- Annual third-party penetration test (planned)

## 7. Data subject rights

Bumblebee assists Customer in honoring data subject requests:

| Right | Mechanism |
|---|---|
| Access | Customer exports via `GET /api/audit/events.csv` + DB export on request |
| Rectification | Customer updates via the Bumblebee web UI |
| Erasure | Workspace soft-delete (30 days) → hard-delete; or per-user delete on request |
| Portability | DB dump in `pg_dump` format on request |
| Objection | Customer can pause processing by suspending workspace |

Response SLA: 30 days from Customer notification.

## 8. Breach notification

Bumblebee notifies Customer within 72 hours of confirming a Personal Data Breach, with:
- Nature of the breach
- Categories + approximate number of data subjects + records
- Likely consequences
- Mitigation taken / planned

## 9. International transfers

For EU/UK data: rely on Standard Contractual Clauses (SCCs) Module Two (Controller to Processor) where infrastructure is hosted outside the EEA.

## 10. Audit

Customer may audit Processor's compliance once per calendar year with 30 days notice. SOC2 Type 2 report (when available) satisfies this in lieu of on-site audit.

## 11. Return + deletion

Upon termination:
- 90-day grace period: data retained for restore on request
- After grace period: hard-delete all Customer Personal Data within 30 days
- Backups: included in the deletion process, may persist up to 90 additional days in encrypted cold storage before purge

## 12. Governing law

Per the underlying Subscription Agreement.

---

**Customer signature** | **Processor signature**
---|---
Date: | Date:
Name: | Name:
Title: | Title:
