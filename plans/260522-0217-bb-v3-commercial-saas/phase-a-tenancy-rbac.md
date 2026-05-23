# Phase A — Tenancy + RBAC

## Context

- Plan: [plan.md](plan.md)
- Brainstorm: `plans/reports/brainstormer-260522-0217-bb-v3-commercial-gaps.md`
- Repo: `D:/Source/bumblebee-v3/`

## Overview

| | |
|---|---|
| Priority | 🔴 Critical — blocks everything |
| Status | pending |
| Weeks | 1-3 |
| Brief | Add workspace/org abstraction, scope every model + endpoint to a workspace, ship 4 roles (owner/admin/member/viewer). JWT carries workspace claim. Workspace settings + member invites UI. |

## Key Insights

- Existing models have NO `workspace_id`. Single-workspace assumption baked into every router.
- `users` + `api_keys` tables exist from earlier auth work. Need `workspace_members` join table.
- Project model becomes scoped to workspace (1 workspace → many projects).
- `default_project` per user for "switch on login".
- Stripe scaffolding runs in parallel weeks 1-2 — see §Implementation Steps step 13.

## Requirements

### Functional
- Sign-up creates a workspace + makes the user `owner`.
- Workspace has name, slug, owner_id, created_at, optionally `stripe_customer_id` (NULL until Phase D).
- Roles: `owner` (1 per workspace, cannot leave), `admin` (manage members + projects), `member` (CRUD issues, trigger workflows), `viewer` (read-only).
- Invite flow: owner/admin sends email invite → invitee accepts → joins workspace with selected role.
- Member can leave; owner can transfer ownership.
- Every API endpoint enforces workspace boundary via JWT claim.
- Every persisted row that "belongs to" a workspace has `workspace_id` FK + NOT NULL.
- Project switcher in sidebar shows only projects in current workspace.
- Workspace switcher (if user is in multiple).

### Non-functional
- Migration is reversible (downgrade tested).
- Existing single-WS data migrated into a "Default" workspace owned by the first user.
- Permission check overhead < 1ms per request (cached via JWT claim, no DB lookup).
- No N+1 on workspace member list.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  POST /api/auth/register                                 │
│    → create user                                         │
│    → create workspace (slug from email or input)         │
│    → create workspace_member (role=owner)                │
│    → mint JWT with { sub: user_id, ws: workspace_id, role}│
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  every router: `Depends(require_workspace)` →            │
│    extracts workspace_id from JWT                        │
│    + checks role allows the operation (decorator)        │
└─────────────────────────────────────────────────────────┘
```

Permission matrix (per-resource):

| Resource | viewer | member | admin | owner |
|---|---|---|---|---|
| Read issues / events / runs | ✓ | ✓ | ✓ | ✓ |
| Create/update issue | — | ✓ | ✓ | ✓ |
| Delete issue | — | — | ✓ | ✓ |
| Trigger workflow | — | ✓ | ✓ | ✓ |
| Manage members | — | — | ✓ | ✓ |
| Manage billing | — | — | — | ✓ |
| Delete workspace | — | — | — | ✓ |
| Transfer ownership | — | — | — | ✓ |

## Related Code Files

### Create
- `bumblebee/models/workspace.py` — Workspace + WorkspaceMember + invite token
- `bumblebee/services/rbac/permissions.py` — `Permission` enum, `check(user_role, permission) -> bool`
- `bumblebee/services/rbac/dependencies.py` — `require_workspace`, `require_role(role)`, `require_permission(perm)` FastAPI deps
- `bumblebee/routers/workspaces.py` — CRUD workspace, members, invites
- `alembic/versions/20260525_0001_workspace_tenancy.py` — migration
- `web/src/app/(app)/settings/workspace/page.tsx` — workspace settings UI
- `web/src/app/(app)/settings/members/page.tsx` — members + invites UI
- `web/src/components/app/workspace-switcher.tsx` — top of sidebar
- `web/src/lib/auth.ts` — JWT decoding helper to read workspace claim

### Modify
- All `bumblebee/models/*.py` — add `workspace_id` FK + index
- `bumblebee/auth/security.py` — JWT now includes `ws` + `role` claims
- `bumblebee/auth/dependencies.py` — extract `ws` + `role` from token
- All `bumblebee/routers/*.py` — wrap with `require_workspace` dep
- `bumblebee/routers/projects.py` — list scoped to workspace
- `web/src/lib/api-client.ts` — `getActiveWorkspace()` helper
- `web/src/components/app/sidebar.tsx` — workspace switcher above project switcher
- `web/src/components/app/project-switcher.tsx` — filter by current workspace

### Delete
- (none)

## Implementation Steps

1. **Schema design** — sketch ERD: `workspace` → `workspace_member` → existing `user` + `project`. Decide cascade rules (workspace delete → projects? hard cascade with grace period).
2. **Migration** — `alembic revision -m "workspace tenancy"`. Create `workspaces` + `workspace_members` + `workspace_invites` tables. Add `workspace_id` FK to: projects, issues, events, agent_sessions, workflow_runs, knowledge_entries, chat_sessions, notifications, api_keys, scope_leases. NOT NULL where possible, indexed.
3. **Data migration** — script: create default workspace "Default" → first user becomes owner → bulk-update all existing rows to that workspace_id. Reversible.
4. **Models** — `Workspace`, `WorkspaceMember(workspace_id, user_id, role)`, `WorkspaceInvite(token, email, role, expires_at)`.
5. **RBAC primitive** — `Permission` enum (READ_ISSUE, WRITE_ISSUE, DELETE_ISSUE, TRIGGER_WORKFLOW, MANAGE_MEMBERS, MANAGE_BILLING, …). `ROLE_PERMS: dict[Role, set[Permission]]`.
6. **Auth refactor** — `mint_jwt(user_id, workspace_id, role)`. JWT payload: `{sub, ws, role, exp}`. Update register/login to bind to a workspace.
7. **FastAPI deps** — `require_workspace`, `require_role`, `require_permission`. Each router gets a dep.
8. **Workspace router** — POST `/api/workspaces` (create), GET (list mine), PATCH (rename, only owner), DELETE (only owner, soft delete 30d).
9. **Member router** — POST `/api/workspaces/{ws_id}/invites` (admin+), POST `/api/invites/{token}/accept`, GET `/api/workspaces/{ws_id}/members`, PATCH role, DELETE (kick).
10. **Existing router refactor** — every endpoint passes `workspace_id` filter into queries. Project list query: `WHERE workspace_id = current_ws`. Issues list query same.
11. **WS broadcast** — `manager.broadcast` becomes scoped to `(workspace_id, project_slug)` not just project_slug. Refactor `event_log.append_event` to look up workspace_id.
12. **Frontend — workspace switcher** — new component above project switcher. Persist active workspace in localStorage. Switching reloads page (same pattern as project switcher).
13. **Frontend — settings pages** — `/settings/workspace` (rename, danger-zone delete), `/settings/members` (member list, invite form, role dropdown, remove button).
14. **Parallel: Stripe scaffolding** (weeks 1-2)
    - `pip install stripe` → add to pyproject
    - `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (frontend)
    - `bumblebee/services/billing/stripe_client.py` — wrap Stripe SDK with retries + idempotency keys
    - `scripts/stripe_setup_catalog.py` — creates Products + Prices via API (free, pro $20/mo, team $100/mo + LLM-cost passthrough). Idempotent.
    - `bumblebee/routers/stripe_webhooks.py` skeleton — `POST /api/stripe/webhook` with signature verification, dispatch on event.type, NO-OP handlers (filled in Phase D).
    - Migration adds `workspace.stripe_customer_id` + `workspace.stripe_subscription_id` columns (nullable, indexed).
    - `docs/stripe-integration.md` — local dev with Stripe CLI (`stripe listen --forward-to localhost:8000/api/stripe/webhook`).
15. **Tests** — pytest: register flow creates workspace, JWT carries ws claim, viewer can't write, admin can manage members, cross-workspace access denied. ≥30 new tests.
16. **Web E2E** — Playwright: invite flow, role enforcement (viewer button hidden), workspace switch reloads scoped data.

## Todo

- [ ] Schema ERD reviewed
- [ ] Alembic migration written + reversible test passes
- [ ] Data migration script tested on staging snapshot
- [ ] Workspace + WorkspaceMember + WorkspaceInvite models
- [ ] Permission enum + role mapping
- [ ] JWT now carries `ws` + `role`
- [ ] `require_workspace` + `require_permission` deps
- [ ] All routers gated by deps
- [ ] All queries filtered by workspace_id
- [ ] WS broadcast scoped to workspace
- [ ] Workspace router + member router
- [ ] Workspace switcher UI (sidebar top)
- [ ] Workspace settings page
- [ ] Members page (list, invite, role change, remove)
- [ ] Frontend reads JWT claims
- [ ] Stripe SDK installed + .env wired
- [ ] Stripe catalog setup script run on test mode
- [ ] Webhook skeleton + signature verify
- [ ] `workspace.stripe_customer_id` migration shipped
- [ ] Pytest coverage ≥80% on RBAC paths
- [ ] Playwright E2E for invite + role enforcement

## Success Criteria

- ✅ Cross-workspace access returns 403 in all queries
- ✅ Viewer role cannot mutate; admin cannot delete workspace
- ✅ Owner transfer works (and re-mints both users' JWTs)
- ✅ Invite link expires after 7 days
- ✅ Workspace soft-delete schedules hard-delete after 30 days
- ✅ Existing seed data preserved in Default workspace
- ✅ WS broadcast doesn't leak events across workspaces
- ✅ Stripe webhook endpoint reachable + verifies signatures (no-op handlers OK)
- ✅ Stripe Products + Prices created (free/pro/team) visible in Dashboard

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration breaks dev seed | Med | High | Reversible migration, snapshot-tested |
| JWT claim invalidation when role changes | High | Med | On role change → invalidate user's tokens (token version on user row, bumped on role change) |
| RBAC decorator forgotten on new endpoint | Med | High | Add test that asserts every router has `require_workspace`; CI grep |
| Stripe signature verify fails on production | Low | High | Test with Stripe CLI + real webhook in test mode before merging |
| `default_workspace` for new users wrong | Med | Low | Always set on register; sensible default behavior |

## Security Considerations

- JWT contains `ws` claim — must be validated on EVERY authenticated route (not just `Authorization` checked)
- Invite tokens are single-use, expire 7 days, generated with `secrets.token_urlsafe(32)`
- Workspace slug is user-provided — sanitize (lowercase, no special chars, uniqueness check)
- Member kick → revoke their JWTs (token version bump)
- Cross-tenant query MUST 403, never 404 (else exposes existence)
- Stripe webhook signature MUST be verified (`stripe.Webhook.construct_event`) — reject otherwise

## Next Steps

- **Blocks**: Phase B (MCP server needs workspace_id to scope tool calls), Phase D (Stripe Subscription attaches to workspace.stripe_customer_id)
- **Unlocks**: Multi-customer signups, role-based access patterns, billing customer creation
