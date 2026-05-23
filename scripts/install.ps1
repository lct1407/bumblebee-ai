# Bumblebee one-shot self-host installer for Windows PowerShell.
#
#   iwr -useb https://raw.githubusercontent.com/lct1407/bumblebee/master/scripts/install.ps1 | iex
#
# Performs the same steps as install.sh but using PowerShell syntax.
$ErrorActionPreference = "Stop"

$BB_HOME = if ($env:BB_HOME) { $env:BB_HOME } else { "$HOME\.bumblebee" }
$REPO_URL = "https://github.com/lct1407/bumblebee"

function Say  { param($m) Write-Host "[bumblebee] $m" -ForegroundColor Blue }
function Ok   { param($m) Write-Host "✓ $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "! $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "✗ $m" -ForegroundColor Red; exit 1 }

Say "Checking prerequisites…"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Die "Python 3.12+ required" }
$pyver = (python -c "import sys;print(f'{sys.version_info[0]}.{sys.version_info[1]}')").Trim()
if ($pyver -notmatch "^3\.(12|13|14)$") { Die "Python 3.12+ required (have $pyver)" }
Ok "python $pyver"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "Docker required" }
Ok "docker found"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die "Git required" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Warn "node not found — web/CLI features will fail" }

New-Item -ItemType Directory -Path $BB_HOME -Force | Out-Null
$repoDir = Join-Path $BB_HOME "bumblebee"
if (Test-Path "$repoDir\.git") {
  Say "Updating existing checkout at $repoDir"
  git -C $repoDir pull --ff-only
} else {
  Say "Cloning $REPO_URL → $repoDir"
  git clone $REPO_URL $repoDir
}
Set-Location $repoDir
Ok "repo ready"

Say "Installing bumblebee Python package…"
python -m pip install --user -e . | Out-Null
Ok "bumblebee CLI installed (try: bb --version)"

Say "Starting Postgres via docker compose…"
docker compose up -d | Out-Null
Start-Sleep -Seconds 3
Ok "Postgres running on localhost:5433"

Say "Running migrations…"
alembic upgrade head
Ok "migrations applied"

Say "Seeding default data…"
try { python -m bumblebee.seeds.seed_default } catch { Warn "seed already applied?" }
Ok "seed complete"

if ((Get-Command npm -ErrorAction SilentlyContinue) -and (Test-Path "web")) {
  Say "Installing web frontend deps (npm)…"
  Push-Location web
  npm install --silent
  Pop-Location
  Ok "web deps installed"
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  Bumblebee đã cài đặt xong! 🐝" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Bước tiếp theo:"
Write-Host ""
Write-Host "  1. Khởi động API server" -ForegroundColor Blue
Write-Host "     uvicorn bumblebee.main:app --reload --port 8000"
Write-Host ""
Write-Host "  2. Khởi động web frontend (terminal khác)" -ForegroundColor Blue
Write-Host "     cd web; npm run dev"
Write-Host ""
Write-Host "  3. Mở browser" -ForegroundColor Blue
Write-Host "     http://localhost:3000"
Write-Host ""
Write-Host "  4. Đăng ký account + tạo project + pair máy:" -ForegroundColor Blue
Write-Host "     bb device pair --server http://localhost:8000"
Write-Host ""
Write-Host "  Hướng dẫn: $repoDir\docs\user-guide-vi.md"
Write-Host "  Hoặc trong app: http://localhost:3000/help"
Write-Host ""
