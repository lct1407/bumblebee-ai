#!/usr/bin/env bash
# Bumblebee — one-shot SSH server bootstrap (Ubuntu/Debian).
#
# Run this ONCE on a fresh Ubuntu 22.04+ server:
#   curl -fsSL https://raw.githubusercontent.com/lct1407/bumblebee-ai/master/infra/server-bootstrap.sh | sudo bash
#
# Or copy + run:
#   scp infra/server-bootstrap.sh user@host:/tmp/
#   ssh user@host "sudo bash /tmp/server-bootstrap.sh"
#
# Sets up:
#   - Docker + compose plugin
#   - Non-root deploy user `bumblebee` (uid 2000) with passwordless docker
#   - /opt/bumblebee app dir with git checkout + .env stub
#   - systemd unit `bumblebee.service` that brings up docker compose on boot
#   - Daily Postgres backup cron at 02:00 UTC
#   - UFW firewall: 22, 80, 443 only (or just 22 if using cloudflared)
#   - Optional: cloudflared install (if CF_TUNNEL_TOKEN env set)
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-bumblebee}"
APP_DIR="${APP_DIR:-/opt/bumblebee}"
REPO_URL="${REPO_URL:-https://github.com/lct1407/bumblebee-ai.git}"
BRANCH="${BRANCH:-master}"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say(){ printf "%b[bb]%b %s\n" "$BLUE" "$NC" "$*"; }
ok(){ printf "%b✓%b %s\n" "$GREEN" "$NC" "$*"; }
warn(){ printf "%b!%b %s\n" "$YELLOW" "$NC" "$*"; }
die(){ printf "%b✗%b %s\n" "$RED" "$NC" "$*"; exit 1; }

[ "$EUID" -eq 0 ] || die "Must run as root (use sudo)"

# 1. Updates + essentials
say "Installing base packages..."
apt-get update -qq
apt-get install -y -qq curl git ufw rsync ca-certificates gnupg
ok "base packages"

# 2. Docker
if ! command -v docker >/dev/null; then
    say "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    OS_CODENAME=$(. /etc/os-release; echo "$VERSION_CODENAME")
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $OS_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
fi
ok "docker $(docker --version | awk '{print $3}' | tr -d ,)"

# 3. Deploy user
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    say "Creating deploy user $DEPLOY_USER..."
    useradd -m -u 2000 -s /bin/bash "$DEPLOY_USER"
    usermod -aG docker "$DEPLOY_USER"
fi
ok "user $DEPLOY_USER (uid $(id -u $DEPLOY_USER), groups: $(id -nG $DEPLOY_USER))"

# 4. App directory
say "Setting up $APP_DIR..."
mkdir -p "$APP_DIR" "$APP_DIR/backups"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
    sudo -u "$DEPLOY_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
    sudo -u "$DEPLOY_USER" bash -c "cd '$APP_DIR' && git fetch origin && git reset --hard origin/$BRANCH"
fi
ok "$APP_DIR @ $(cd $APP_DIR && sudo -u $DEPLOY_USER git rev-parse --short HEAD)"

# 5. .env stub if missing
if [ ! -f "$APP_DIR/.env" ]; then
    say "Creating .env stub — FILL IN MANUALLY before first start"
    cat > "$APP_DIR/.env" <<'EOF'
# === Bumblebee production .env ===
# Fill in then run: docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml --profile tunnel up -d

# REQUIRED ────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://bumblebee:CHANGEME@db:5432/bumblebee
API_SECRET_KEY=GENERATE_WITH_openssl_rand_-hex_32
ENVIRONMENT=production

# Public URLs (set to your domain)
PUBLIC_API_URL=https://api.bb.yourdomain.com
DOMAIN_API=api.bb.yourdomain.com
DOMAIN_WEB=bb.yourdomain.com

# LLM provider (recommend Vertex AI for prod)
VERTEX_AI_PROJECT=
VERTEX_AI_LOCATION=global
VERTEX_AI_API_KEY=
ANTHROPIC_API_KEY=

# Stripe (live keys for prod, test for staging)
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_ID=price_...
STRIPE_PRICE_TEAM_ID=price_...
STRIPE_PRICE_TEAM_USAGE_ID=price_...
BILLING_ENABLED=true

# CHOOSE ONE proxy strategy ─────────────────────────────────────
# Option A: Cloudflare Tunnel (recommended) — paste the tunnel token here:
CLOUDFLARE_TUNNEL_TOKEN=

# Option B: Caddy direct — leave token empty, expose 80/443
# (also need to point your domain's A record at this server IP)

# OPTIONAL ──────────────────────────────────────────────────────
SENTRY_DSN=
GITHUB_WEBHOOK_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
    chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    warn "  → edit $APP_DIR/.env now, then re-run this script (idempotent)"
fi

# 6. systemd unit
say "Installing systemd unit..."
cat > /etc/systemd/system/bumblebee.service <<EOF
[Unit]
Description=Bumblebee SaaS stack
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
User=$DEPLOY_USER
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml --profile tunnel up -d
ExecStop=/usr/bin/docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml down
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable bumblebee.service
ok "systemd unit bumblebee.service installed"

# 7. Backup cron
say "Installing nightly Postgres backup cron..."
chmod +x "$APP_DIR/scripts/backup-postgres-cron.sh" 2>/dev/null || true
cat > /etc/cron.d/bumblebee-backup <<EOF
# Nightly Postgres dump at 02:00 UTC
0 2 * * * $DEPLOY_USER cd $APP_DIR && DATABASE_URL=\$(grep ^DATABASE_URL .env | cut -d= -f2-) BACKUP_DIR=$APP_DIR/backups bash $APP_DIR/scripts/backup-postgres-cron.sh >> /var/log/bumblebee-backup.log 2>&1
EOF
ok "cron installed (/etc/cron.d/bumblebee-backup)"

# 8. UFW firewall
say "Configuring UFW firewall..."
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
# If using Caddy directly (no tunnel) — open 80/443:
if grep -q "^CLOUDFLARE_TUNNEL_TOKEN=$" "$APP_DIR/.env" 2>/dev/null || ! grep -q "^CLOUDFLARE_TUNNEL_TOKEN=" "$APP_DIR/.env" 2>/dev/null; then
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    warn "  ports 80/443 opened — will be needed for Caddy direct mode"
fi
ufw --force enable >/dev/null 2>&1 || true
ok "ufw enabled"

# 9. Print next steps
cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
  Bootstrap done. Next steps:
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

  1. Edit /opt/bumblebee/.env and fill in:
     - API_SECRET_KEY (openssl rand -hex 32)
     - DATABASE_URL password
     - PUBLIC_API_URL / DOMAIN_API / DOMAIN_WEB
     - LLM provider keys
     - Stripe keys
     - CLOUDFLARE_TUNNEL_TOKEN (recommended)

  2. Pull production images:
     cd /opt/bumblebee
     sudo -u bumblebee docker compose pull

  3. First-time DB migration:
     sudo -u bumblebee docker compose run --rm api alembic upgrade head
     sudo -u bumblebee docker compose run --rm api python -m bumblebee.seeds.seed_default

  4. Start the stack:
     sudo systemctl start bumblebee
     sudo systemctl status bumblebee

  5. (If using Cloudflare Tunnel) — configure your tunnel routes:
     - api.bb.yourdomain.com → http://api:8000
     - bb.yourdomain.com     → http://web:3000

  6. Verify:
     curl https://api.bb.yourdomain.com/health/
     curl https://bb.yourdomain.com/

EOF
