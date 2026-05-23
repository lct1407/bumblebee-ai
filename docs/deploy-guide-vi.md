# Deploy Bumblebee lên SSH server + Cloudflare + GitHub CI/CD

Hướng dẫn end-to-end tự động deploy. Mỗi push lên `master` sẽ tự build → test → push image → SSH deploy → smoke check.

---

## 1. Inputs ông cần cung cấp

| # | Item | Lấy ở đâu |
|---|---|---|
| 1 | **SSH server** Ubuntu 22.04+ | VPS bất kỳ (Hetzner / DigitalOcean / Vultr / OVH …) — min 2vCPU, 4GB RAM, 40GB disk |
| 2 | **SSH user + private key** (deploy user, có sudo) | `ssh-keygen -t ed25519 -f deploy_key` → copy public key vào `~/.ssh/authorized_keys` |
| 3 | **Domain name** (vd `bb.yourdomain.com`) | Bất kỳ domain ông sở hữu, đã add vào Cloudflare |
| 4 | **Cloudflare API token** | https://dash.cloudflare.com/profile/api-tokens → Create Token → "Edit zone DNS" template → giới hạn vào Zone của ông |
| 5 | **Cloudflare Zone ID** | URL của zone trong dashboard: `https://dash.cloudflare.com/<account>/<zone-id>/...` |
| 6 | (Recommend) **Cloudflare Tunnel token** | Zero Trust → Networks → Tunnels → Create tunnel → copy token |
| 7 | **Stripe live keys + Vertex AI key** (cho prod) | Stripe Dashboard live mode + GCP console |

---

## 2. Architecture deploy

### Option A — Cloudflare Tunnel (recommended)

```
   GitHub Actions push → GHCR images
                          ↓
   [Cloudflare Edge]    [ Your server (NO public ports) ]
        ↓                  cloudflared ⇄ docker network
   bb.yourdomain.com ⇄ tunnel ⇄ web:3000
   api.bb.yourdomain.com ⇄ tunnel ⇄ api:8000
                          ↓
                      Postgres :5432 (internal only)
```

**Ưu**: zero port exposure, không cần Let's Encrypt, DDoS protection Cloudflare lo, không cần mở 80/443.

### Option B — Caddy + Cloudflare DNS

```
   Cloudflare DNS A record → Server IP
                              ↓
   :443 Caddy (auto Let's Encrypt) ⇄ docker internal
                              ↓
                      api / web / db
```

**Khi nào dùng**: ông không muốn Cloudflare Tunnel hoặc cần direct TCP access.

---

## 3. Bootstrap server (chạy 1 lần)

### 3.1. SSH vào server + chạy bootstrap

```bash
# Trên máy local
scp infra/server-bootstrap.sh deploy@your-server.com:/tmp/
ssh deploy@your-server.com "sudo bash /tmp/server-bootstrap.sh"
```

Script tự động:
- Cài Docker + compose plugin
- Tạo user `bumblebee` (uid 2000) với passwordless docker
- Clone repo vào `/opt/bumblebee`
- Tạo `.env` stub
- Cài systemd unit `bumblebee.service`
- Cài cron backup Postgres 02:00 UTC mỗi đêm
- UFW firewall: 22 (+ 80/443 nếu dùng Caddy)

### 3.2. Edit `.env` trên server

```bash
ssh deploy@your-server.com
sudo -u bumblebee nano /opt/bumblebee/.env
```

Điền vào:

```bash
# Generate via: openssl rand -hex 32
API_SECRET_KEY=<32 bytes hex>

DATABASE_URL=postgresql+asyncpg://bumblebee:<strong-password>@db:5432/bumblebee

PUBLIC_API_URL=https://api.bb.yourdomain.com
DOMAIN_API=api.bb.yourdomain.com
DOMAIN_WEB=bb.yourdomain.com

VERTEX_AI_PROJECT=<your-gcp-project>
VERTEX_AI_LOCATION=global
VERTEX_AI_API_KEY=<your-vertex-key>

STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_ID=price_...
STRIPE_PRICE_TEAM_ID=price_...
STRIPE_PRICE_TEAM_USAGE_ID=price_...
BILLING_ENABLED=true

# Option A — Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
```

### 3.3. (Option A only) Setup Cloudflare Tunnel routes

Trong dashboard Cloudflare → Zero Trust → Tunnels → tunnel ông vừa tạo → **Public Hostnames**:

| Subdomain | Service |
|---|---|
| `api.bb.yourdomain.com` | `http://api:8000` |
| `bb.yourdomain.com` | `http://web:3000` |

Lưu. CF tự tạo CNAME records.

### 3.4. First-time DB migration + seed

```bash
cd /opt/bumblebee
sudo -u bumblebee docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml pull
sudo -u bumblebee docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml run --rm api alembic upgrade head
sudo -u bumblebee docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml run --rm api python -m bumblebee.seeds.seed_default
```

### 3.5. Start stack

```bash
sudo systemctl start bumblebee
sudo systemctl status bumblebee
```

Verify:

```bash
curl https://api.bb.yourdomain.com/health/
# → {"status":"ok","service":"bumblebee-api","version":"0.4.0"}

curl https://bb.yourdomain.com/
# → Next.js landing page HTML
```

---

## 4. GitHub Actions CI/CD setup

### 4.1. Add secrets vào GitHub repo

`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Giá trị |
|---|---|
| `SSH_HOST` | IP hoặc hostname server |
| `SSH_USER` | `bumblebee` (deploy user từ bootstrap) |
| `SSH_PORT` | 22 (default) |
| `SSH_PRIVATE_KEY` | nội dung file `deploy_key` (private key) |
| `CLOUDFLARE_API_TOKEN` | token với Zone:DNS:Edit |
| `CLOUDFLARE_ZONE_ID` | zone id từ CF dashboard |
| `DOMAIN_API` | `api.bb.yourdomain.com` |
| `DOMAIN_WEB` | `bb.yourdomain.com` |
| `SERVER_IP` | public IP server (chỉ cần nếu Caddy mode) |

### 4.2. Add public key của deploy_key vào server

```bash
ssh deploy@your-server.com
sudo -u bumblebee bash -c 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < deploy_key.pub
sudo -u bumblebee chmod 600 ~/.ssh/authorized_keys
```

### 4.3. Trigger first deploy

```bash
# Trên máy local
git push origin master
```

GitHub Actions sẽ:
1. **test** job — chạy pytest (32 tests trong `test_new_modules_smoke.py` + `test_issue_links.py`)
2. **build** job — build api + web Docker images, push lên `ghcr.io/lct1407/bumblebee-{ai,web}:latest` + `:<sha>`
3. **deploy** job:
   - Sync Cloudflare DNS A records (nếu dùng Caddy mode)
   - SSH vào server → `git reset --hard <sha>` → `docker compose pull` → `alembic upgrade head` → `systemctl restart bumblebee`
   - Verify `curl /health/` trả 200

Workflow file: `.github/workflows/deploy.yml`.

Theo dõi tại: `https://github.com/lct1407/bumblebee-ai/actions`.

### 4.4. Manual deploy hoặc staging

GitHub Actions tab → **deploy** workflow → **Run workflow** → chọn environment.

Hoặc push lên branch `dev` → tự deploy lên staging environment (cần config GitHub environment `staging` với secrets riêng).

---

## 5. Verify deploy

### Smoke checks

```bash
# Health
curl https://api.bb.yourdomain.com/health/                       # → {"status":"ok"}
curl https://api.bb.yourdomain.com/health/db                     # → {"db":"ok"}

# GraphQL
curl -X POST https://api.bb.yourdomain.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } } }"}'

# Metrics
curl https://api.bb.yourdomain.com/metrics                       # Prometheus format

# Web landing
curl -I https://bb.yourdomain.com/                                # → 200 + Cloudflare headers
```

### E2E from CLI

```bash
# Local CLI hits prod
export BUMBLEBEE_SERVER_URL=https://api.bb.yourdomain.com
bb login your-username
bb whoami
bb issue create "Test from deployed CLI" --project bb
```

---

## 6. Rollback nếu deploy fail

GitHub Actions deploy step fails → systemd vẫn chạy version cũ (chỉ rollout sau khi build success + healthcheck pass).

Manual rollback:

```bash
ssh deploy@your-server.com
cd /opt/bumblebee
git log --oneline -5                                # tìm sha cũ
git reset --hard <previous-sha>
sudo systemctl restart bumblebee
```

---

## 7. Operations

### Logs

```bash
# systemd
sudo journalctl -u bumblebee -f

# api container
docker compose logs -f api

# Postgres
docker compose logs -f db
```

### Backup

Cron tự chạy `/opt/bumblebee/scripts/backup-postgres-cron.sh` mỗi đêm 02:00 UTC.

Manual:

```bash
sudo -u bumblebee BACKUP_DIR=/opt/bumblebee/backups \
  DATABASE_URL=$(grep ^DATABASE_URL /opt/bumblebee/.env | cut -d= -f2-) \
  bash /opt/bumblebee/scripts/backup-postgres-cron.sh
```

### Restore từ backup

```bash
gunzip < backups/bumblebee-20260523-020000.sql.gz | \
  docker compose exec -T db psql -U bumblebee bumblebee
```

### Update image manually (không qua CI)

```bash
cd /opt/bumblebee
sudo -u bumblebee docker compose pull
sudo systemctl restart bumblebee
```

### Sentry / metrics dashboards

- Sentry: set `SENTRY_DSN` trong `.env`, errors stream tự động
- Metrics: scrape `/metrics` endpoint với Prometheus + Grafana

---

## 8. Tổng kết — Ông cần làm gì

1. **VPS provision** (Hetzner CX22 $4/mo đủ cho beta)
2. **Domain + Cloudflare** (free plan đủ)
3. **Cloudflare Tunnel** tạo + lấy token (5 phút)
4. **Add 9 GitHub Secrets** (10 phút)
5. **Run `server-bootstrap.sh`** (10 phút)
6. **Edit `.env` + setup tunnel routes** (5 phút)
7. **`git push origin master`** → CI/CD tự lo phần còn lại

**Tổng: ~30-45 phút** cho lần đầu. Sau đó mọi push tự deploy.

---

## 9. Files đã tạo trong repo

| File | Mục đích |
|---|---|
| `infra/docker-compose.prod.yml` | Production overlay với cloudflared + caddy profiles |
| `infra/Caddyfile` | Reverse proxy config (nếu không dùng Tunnel) |
| `infra/server-bootstrap.sh` | One-shot bootstrap script (chạy sudo bash) |
| `infra/cloudflare-dns-sync.sh` | Upsert A records qua API |
| `.github/workflows/deploy.yml` | CI/CD pipeline (test → build → deploy) |
| `scripts/backup-postgres-cron.sh` | Nightly DB backup (đã có từ BB-9) |

---

**Cập nhật cuối:** 2026-05-23
