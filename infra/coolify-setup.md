# Coolify deployment with Cloudflare Tunnel

This is the production setup. Every merge to `master` → CI tests + builds GHCR images → calls Coolify deploy webhook → Coolify pulls + restarts containers. Cloudflare Tunnel fronts the stack (TLS + reverse proxy at the edge, no public ports on the VPS).

## 1. Resources (already provisioned)

| Resource | Value |
|---|---|
| Coolify host | `68.183.118.170` (DigitalOcean), dashboard at `https://coolify.hubapi.cc` |
| Cloudflare zone | `hubapi.cc` (zone_id `67f3f082a89984206997d091672ad801`) |
| Cloudflare Tunnel | name `bumblebee`, id `f200e092-f979-4438-8e9c-6c78b3a795e6` (account `2c488a9cc706930a4b0a163a9d989f8d`) |
| Postgres | `db.sidcorp.co:15434/bumblebee` (managed, external) |
| GHCR images | `ghcr.io/lct1407/bumblebee-ai:latest`, `ghcr.io/lct1407/bumblebee-web:latest` |

## 2. Routing (Cloudflare Tunnel ingress)

The tunnel terminates TLS at Cloudflare edge and forwards to internal Docker DNS names on the VPS — no Caddy, no Let's Encrypt, no exposed ports.

| Public URL | Tunnel rule | Container target |
|---|---|---|
| `https://bb-api.hubapi.cc` | hostname | `http://api:8000` |
| `https://bb.hubapi.cc` | hostname | `http://web:3000` |
| `https://bb.hubapi.cc/mcp/*` | hostname + path `/mcp.*` | `http://mcp:8080` |
| `https://bumble.hubapi.cc` | hostname (marketing alias) | `http://web:3000` |
| `https://coolify.hubapi.cc` | hostname | `http://coolify:8080` |

The container service names (`api`, `web`, `mcp`) in `infra/docker-compose.coolify.yml` **must match** the tunnel's ingress URLs. To change routing:
```bash
# Edit INGRESS in scripts/update-cloudflare-tunnel.py
python scripts/update-cloudflare-tunnel.py
```
This is idempotent — safe to re-run.

## 3. Coolify application setup (one-time)

### 3.1 Create app
1. Open `https://coolify.hubapi.cc` → New Resource → **Docker Compose**.
2. Repository: `lct1407/bumblebee-ai`, branch: `master`.
3. Compose file path: `infra/docker-compose.coolify.yml`.
4. **Do NOT add Coolify Domains** — Cloudflare Tunnel owns routing. Coolify just runs the containers.
5. Enable **Auto Deploy on Git Push** (Coolify wires its webhook into GitHub for you).

### 3.2 Environment variables (Coolify UI → Environment)
Required:
```
DATABASE_URL=postgresql+asyncpg://bumblebee:<password>@db.sidcorp.co:15434/bumblebee
API_SECRET_KEY=<openssl rand -hex 32>
BILLING_ENABLED=true
BUMBLEBEE_PROVIDER=claude-cli
```
Optional:
```
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
VERTEX_AI_PROJECT=
VERTEX_AI_LOCATION=global
VERTEX_AI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_ID=
STRIPE_PRICE_TEAM_ID=
STRIPE_PRICE_TEAM_USAGE_ID=
```
`PUBLIC_API_URL` and `NEXT_PUBLIC_API_URL` are hardcoded to `https://bb-api.hubapi.cc` in the compose — no need to set.

### 3.3 Network — the tunnel must reach containers
Coolify creates a Docker network per stack. The `cloudflared` container (the tunnel daemon, also running on this VPS) needs to be on the **same Docker network** as `api`/`web`/`mcp` so it can resolve `api:8000` etc.

Either:
- Run the tunnel daemon in the same Coolify stack (recommended), OR
- Use `docker network connect <coolify_stack_net> cloudflared` once after first deploy.

Verify after deploy:
```bash
ssh root@68.183.118.170 'docker network inspect $(docker inspect cloudflared --format "{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}")' \
  | jq '.[].Containers[].Name'
# expected to include api / web / mcp containers
```

### 3.4 Get the deploy webhook
Coolify → Application → **Webhooks** → copy the **Deploy** URL (looks like `https://coolify.hubapi.cc/api/v1/deploy?uuid=<APP_UUID>&force=false`).

## 4. Wire GitHub → Coolify auto-deploy

### 4.1 Repo secrets (Settings → Secrets and variables → Actions)
| Name | Value |
|---|---|
| `COOLIFY_WEBHOOK_URL` | URL from §3.4 |
| `COOLIFY_API_TOKEN` | optional Bearer token if webhook is protected |
| `PUBLIC_API_URL` | `https://bb-api.hubapi.cc` (post-deploy health probe) |

### 4.2 Repo variable
| Name | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` |

After both are set, push to `master`:
1. `test` job (pytest against ephemeral Postgres).
2. `build` job (push `:latest` + `:<sha>` to GHCR).
3. `deploy` job → `curl ${COOLIFY_WEBHOOK_URL}` → wait for `https://bb-api.hubapi.cc/health` to come back green.

## 5. Verify (after first deploy)

```bash
# API + DB
curl https://bb-api.hubapi.cc/health
curl https://bb-api.hubapi.cc/health/db
# expected: {"db":"ok"}

# Web
curl -sI https://bb.hubapi.cc | head -1     # 200 OK from Next.js

# MCP
curl https://bb.hubapi.cc/mcp/healthz
# {"ok": true, "transport": "mcp-http"}
curl https://bb.hubapi.cc/mcp/tools
# JSON list of 7 tools
```

## 6. Wire MCP to Claude Code / Cursor

`~/.config/claude/claude_desktop_config.json` (or your IDE's MCP config):
```json
{
  "mcpServers": {
    "bumblebee": {
      "url": "https://bb.hubapi.cc/mcp",
      "headers": { "Authorization": "Bearer bb_live_..." }
    }
  }
}
```
Get an API key via `https://bb.hubapi.cc/settings` → API Keys → Create.

For local stdio:
```bash
BUMBLEBEE_API_KEY=bb_live_... python -m bumblebee_mcp.cli --transport stdio
```

## 7. Create a project end-to-end (smoke flow)

1. Open `https://bb.hubapi.cc` → log in (or seed via `bb db seed`).
2. **Settings → Workspaces → New Project** → name, save.
3. Or via MCP from Claude Code: `bumblebee_workspaces(action="create", data='{"name":"Smoke"}')`.
4. **Issues → New** → save → click **Plan** → planner runs → status `PLANNED`.
5. Approve → workflow run dispatched to a paired device.

Full walkthrough: `docs/walkthrough-vi.md`.

## 8. Rolling back / forcing redeploy

```bash
curl -X GET "${COOLIFY_WEBHOOK_URL}&force=true"
```
Or Coolify UI → Application → Deployments → Redeploy a previous commit.

## 9. Legacy files (kept for reference, NOT used)

These were from the pre-Coolify SSH/Caddy deploy. Safe to delete after team validation:
- `infra/docker-compose.prod.yml`
- `infra/Caddyfile`
- `infra/server-bootstrap.sh`
- `infra/cloudflare-dns-sync.sh`

## 10. Architecture summary

```
git push master
   │
   ▼
.github/workflows/deploy.yml
   ├── test         (pytest, ephemeral Postgres 16)
   ├── build        (push GHCR :latest + :<sha>)
   └── deploy       (GET ${COOLIFY_WEBHOOK_URL})
                      │
                      ▼
              Coolify pulls fresh images, restarts stack
                      │
                      ▼
   ┌──────────────────────────────────────────────┐
   │ VPS 68.183.118.170 (Docker network)          │
   │                                              │
   │   api:8000     web:3000     mcp:8080         │
   │       ▲           ▲            ▲             │
   │       └───────────┴────────────┘             │
   │                   │                          │
   │             cloudflared (tunnel daemon)      │
   └───────────────────┼──────────────────────────┘
                       │
                       ▼  (mTLS to Cloudflare edge)
              Cloudflare anycast network
                       │
   ┌───────────────────┼──────────────────────────┐
   │  https://bb-api.hubapi.cc   → api:8000       │
   │  https://bb.hubapi.cc       → web:3000       │
   │  https://bb.hubapi.cc/mcp/* → mcp:8080       │
   │  https://coolify.hubapi.cc  → coolify:8080   │
   └──────────────────────────────────────────────┘
                       │
                       └─► external Postgres @ db.sidcorp.co:15434/bumblebee
```
