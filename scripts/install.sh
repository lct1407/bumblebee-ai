#!/usr/bin/env bash
# Bumblebee one-shot self-host installer.
#
#   curl -fsSL https://raw.githubusercontent.com/lct1407/bumblebee/master/scripts/install.sh | bash
#
# Performs:
#   1. Verify prerequisites (python 3.12+, node 20+, docker)
#   2. Install bumblebee Python package
#   3. Start Postgres via docker compose
#   4. Run alembic migrations + seed
#   5. Install web deps
#   6. Print next-steps banner
set -euo pipefail

BB_HOME="${BB_HOME:-$HOME/.bumblebee}"
REPO_URL="https://github.com/lct1407/bumblebee"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

say() { printf "%b[bumblebee]%b %s\n" "$BLUE" "$NC" "$*"; }
ok()  { printf "%b✓%b %s\n" "$GREEN" "$NC" "$*"; }
warn(){ printf "%b!%b %s\n" "$YELLOW" "$NC" "$*"; }
die() { printf "%b✗%b %s\n" "$RED" "$NC" "$*"; exit 1; }

# 1. Prereqs
say "Checking prerequisites…"
command -v python3 >/dev/null || die "python3 not found. Install Python 3.12+"
PY_VER=$(python3 -c 'import sys;print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
case "$PY_VER" in
  3.12|3.13|3.14) ok "python $PY_VER" ;;
  *) die "python 3.12+ required (have $PY_VER)" ;;
esac
command -v node >/dev/null || warn "node not found — web/CLI features will fail"
command -v docker >/dev/null || die "docker not found. Install Docker"
command -v git >/dev/null || die "git not found"
ok "prerequisites OK"

# 2. Clone or update
mkdir -p "$BB_HOME"
if [ -d "$BB_HOME/bumblebee/.git" ]; then
  say "Updating existing checkout at $BB_HOME/bumblebee"
  git -C "$BB_HOME/bumblebee" pull --ff-only
else
  say "Cloning $REPO_URL → $BB_HOME/bumblebee"
  git clone "$REPO_URL" "$BB_HOME/bumblebee"
fi
cd "$BB_HOME/bumblebee"
ok "repo ready"

# 3. Python install
say "Installing bumblebee Python package (editable)…"
python3 -m pip install --user -e . >/dev/null
ok "bumblebee CLI installed (try: bb --version)"

# 4. Start Postgres
say "Starting Postgres via docker compose…"
docker compose up -d >/dev/null
sleep 3
ok "Postgres running on localhost:5433"

# 5. Migrations + seed
say "Running migrations…"
alembic upgrade head
ok "migrations applied"

say "Seeding default data…"
python3 -m bumblebee.seeds.seed_default || warn "seed already applied?"
ok "seed complete"

# 6. Web deps (optional)
if command -v npm >/dev/null && [ -d "web" ]; then
  say "Installing web frontend deps (npm)…"
  (cd web && npm install --silent)
  ok "web deps installed"
fi

# 7. Done
cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
  Bumblebee đã cài đặt xong! 🐝
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

  Bước tiếp theo:

  ${BLUE}1. Khởi động API server${NC}
     uvicorn bumblebee.main:app --reload --port 8000

  ${BLUE}2. Khởi động web frontend (terminal khác)${NC}
     cd web && npm run dev

  ${BLUE}3. Mở browser${NC}
     http://localhost:3000

  ${BLUE}4. Đăng ký account + tạo project + pair máy bạn:${NC}
     bb device pair --server http://localhost:8000

  Hướng dẫn đầy đủ: $BB_HOME/bumblebee/docs/user-guide-vi.md
  Hoặc trong app: http://localhost:3000/help

EOF
