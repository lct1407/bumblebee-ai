# Bumblebee 2.0 — Testing Guide

Hướng dẫn biến máy của bạn thành **test rig** chuyên kiểm thử các module Bumblebee, và quy trình **chạy test** cho cả 2 chế độ:

- **Manual** — bạn gõ lệnh, đọc kết quả
- **AI auto** — agent (`tester` / Claude Code) tự gen test, chạy, sửa, lặp đến xanh

---

## 0. TL;DR — chạy hết test trong 30 giây

```bash
# Đã setup xong:
bash scripts/test-all.sh           # Linux/macOS/Git-Bash
pwsh scripts/test-all.ps1          # Windows PowerShell
```

Báo cáo coverage HTML xuất ra `plans/reports/coverage-api/index.html`.

---

## 1. Một lần — Setup máy thành test rig

### 1.1 Yêu cầu hệ thống

| Tool | Version | Note |
|---|---|---|
| Python | 3.11+ | Khuyến nghị conda env `bb` (xem `environment.yml`) |
| Node | 20+ | `node --version` |
| npm | 10+ | đi kèm Node |
| PostgreSQL | reachable | mặc định `db.sidcorp.co:15434/tasks_cli` (config qua `api/.env`) |
| git | any | cần cho git node tests |

### 1.2 Tạo conda env (lần đầu)

```bash
conda env create -f environment.yml      # tạo env "bb"
conda activate bb
```

Nếu không dùng conda:
```bash
python -m venv .venv && source .venv/bin/activate     # Linux/Mac
python -m venv .venv && .\.venv\Scripts\activate      # Windows
```

### 1.3 Chạy script setup (idempotent)

```bash
bash scripts/test-setup.sh        # Linux/Mac/Git-Bash
pwsh scripts/test-setup.ps1       # Windows PowerShell
```

Script sẽ:
1. Cài backend deps + pytest stack vào env `bb` (`pytest`, `pytest-asyncio`, `pytest-cov`, `pytest-mock`, `pytest-xdist`)
2. `npm install` cho `web/` và `cli-ts/`
3. Cài Playwright Chromium browser
4. Copy `.env.example` → `.env` cho mỗi package nếu chưa có

### 1.4 Cấu hình `.env`

**`api/.env`** — bắt buộc edit:
```ini
DATABASE_URL=postgresql+asyncpg://user:pass@db.sidcorp.co:15434/tasks_cli
JWT_SECRET=<32-byte-hex>      # tạo: python -c "import secrets; print(secrets.token_hex(32))"
ANTHROPIC_API_KEY=            # chỉ cần cho Wave 5 real-Claude smoke
CLAUDE_CLI_PATH=              # tự resolve nếu để trống
```

**`web/.env`** — thường giữ default:
```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_V2_ENABLED=true
```

**`cli-ts/.env`** — chỉ cần khi test CLI thật:
```ini
BB_API_URL=http://localhost:8000
BB_API_KEY=<token-từ-bb-auth-login>
```

### 1.5 Verify setup

```bash
bash scripts/test-all.sh --no-e2e       # bỏ qua E2E nếu chưa run server
```

Mong đợi: `api PASS · web-unit PASS · cli-ts PASS`.

---

## 2. Cấu trúc thư mục test

```
api/
  src/workflow/tests/         # Unit test workflow engine (đặt cạnh code)
  tests/v2/                   # Integration test v2
    agents/                   # agent runner, A2A, budget
    api/                      # router endpoints
    workflow/                 # run_store, executor
    integration/              # (cần tạo) 4 templates × mocked Claude
  tests/conftest.py           # pytest fixtures dùng chung

web/
  tests/setup.ts              # vitest setup (RTL cleanup)
  tests/unit/                 # vitest component/util tests
  src/**/__tests__/           # vitest co-located với code
  e2e/                        # Playwright E2E
    v2/                       # (cần tạo) 5 scenarios mới

cli-ts/
  tests/setup.ts              # vitest + msw bootstrap
  tests/mocks/handlers.ts     # MSW request handlers
  tests/commands/             # (cần tạo) per-command unit tests
  tests/integration/          # (cần tạo) workflow run, daemon cycle

scripts/
  test-setup.sh / .ps1        # 1 lần setup
  test-all.sh / .ps1          # chạy hết
  run-regression.py           # (Wave 5) 12 cases
  perf-baseline.py            # (Wave 5) load test
```

---

## 3. Lệnh test — per-package cheat sheet

### 3.1 Backend (Python / pytest)

```bash
# Trỏ Python về bb env (Windows ví dụ):
PY=/c/ProgramData/anaconda3/envs/bb/python.exe

# Chạy tất cả v2
$PY -m pytest api/tests/v2 api/src/workflow/tests -q

# Chạy 1 file
$PY -m pytest api/tests/v2/agents/test_runner.py -v

# Chạy 1 test
$PY -m pytest api/tests/v2/agents/test_runner.py::test_extract_usage_parses_tokens

# Coverage HTML
$PY -m pytest api/tests/v2 api/src/workflow/tests \
  --cov=api/src --cov-report=html:plans/reports/coverage-api

# Chạy parallel (nhanh hơn 2-3x)
$PY -m pytest api/tests/v2 -n auto

# Chỉ test thay đổi gần nhất (cần pytest-testmon — optional)
$PY -m pytest --testmon
```

### 3.2 Web (vitest + Playwright)

```bash
cd web
npm test                         # vitest run (1 lần, dùng cho CI)
npm run test:watch               # watch mode
npm run test:cov                 # + coverage HTML ở web/coverage/
npm run test:e2e                 # Playwright (auto start dev server)
npm run test:e2e:headed          # mở browser thấy chạy thật
npx playwright test e2e/v2/auth-and-create.spec.ts   # 1 file
npx playwright test --debug      # step-through inspector
```

### 3.3 CLI (vitest + msw)

```bash
cd cli-ts
npm test                          # vitest run
npm test -- --coverage            # với coverage
npm test -- tests/commands/item   # 1 thư mục
npm test -- -t "item create"      # filter theo test name
```

---

## 4. Manual flow — bạn cập nhật/sửa code rồi chạy test

### 4.1 Sửa code backend → test

```bash
# 1. Sửa file ví dụ api/src/workflow/nodes/git_node.py
# 2. Chạy test liên quan
$PY -m pytest api/src/workflow/tests/test_node_git.py -v
# 3. Nếu thiếu test → viết thêm trong cùng file
# 4. Chạy lại đến xanh
# 5. Check coverage không tụt:
$PY -m pytest api/src/workflow/tests --cov=api/src/workflow/nodes/git_node
```

### 4.2 Sửa component web → test

```bash
cd web
# 1. Sửa src/components/workflow/builder/node-properties-panel.tsx
# 2. Tạo test cùng chỗ: src/components/workflow/builder/__tests__/node-properties-panel.test.tsx
# 3. Watch mode tự re-run khi save:
npm run test:watch
```

### 4.3 Sửa CLI command → test

```bash
cd cli-ts
# 1. Sửa src/commands/item/run.ts
# 2. Update mock handler nếu cần: tests/mocks/handlers.ts
# 3. Test: tests/commands/item-run.test.ts
npm test -- item-run
```

### 4.4 Quy ước test

| Loại | Đặt ở đâu | Pattern tên |
|---|---|---|
| Backend unit | `api/src/<mod>/tests/test_*.py` hoặc `api/tests/v2/<mod>/test_*.py` | `test_<feature>_<case>.py` |
| Web unit | `src/**/__tests__/*.test.tsx` hoặc `tests/unit/*.test.ts` | kebab-case |
| Web E2E | `web/e2e/v2/<feature>.spec.ts` | feature-based |
| CLI unit | `cli-ts/tests/commands/<cmd>.test.ts` | per-command |

**Rule vàng:** không sửa code production mà không add/update test cho behavior mới.

---

## 5. AI auto flow — để agent tự test giúp bạn

### 5.1 Khởi động bằng `tester` skill / agent

Trong Claude Code:
```
/tester
```
Hoặc trong session bình thường, ra prompt rõ ràng — agent sẽ tự gen test, chạy, sửa khi đỏ.

### 5.2 3 prompt template hay dùng

**Template A — Sinh test cho 1 module:**
```
@tester Hãy generate unit tests cho api/src/workflow/nodes/git_node.py.
Yêu cầu: ≥3 cases (happy/invalid_config/failure), mock gh CLI,
target coverage ≥85%. Đặt file ở api/src/workflow/tests/test_node_git.py.
Chạy đến xanh, báo lại coverage.
```

**Template B — Sửa test đỏ:**
```
@tester Test này đang fail: api/tests/v2/agents/test_runner.py::test_run_subprocess_marks_failed_on_nonzero_exit
Hãy chạy với -v -s, đọc traceback, tìm root cause (sửa code production hay test?),
fix, chạy lại đến xanh. Không sửa logic ngoài file gốc trừ khi cần thiết.
```

**Template C — Tăng coverage tới ngưỡng:**
```
@tester Coverage api/src/workflow/nodes/ hiện 47%. Mục tiêu ≥80%.
Chạy: pytest --cov=api/src/workflow/nodes --cov-report=term-missing
Tìm dòng chưa cover, viết test mỗi node lacking, đến khi ≥80%.
KHÔNG hạ ngưỡng để pass — phải viết test thật.
```

### 5.3 Quy trình AI orchestrator (khi bạn chạy `/loop` hay multi-agent)

```
controller
  ├── delegate test gen → tester agent (Wave 1)
  │     output: test files + coverage report
  ├── delegate code fix khi đỏ → fullstack-developer
  ├── delegate review → code-reviewer
  └── merge khi: test xanh + coverage OK + reviewer approve
```

File ownership boundaries (tránh conflict khi parallel):
- `tester` agent: chỉ ghi `api/tests/`, `web/tests/`, `web/e2e/`, `cli-ts/tests/`
- `fullstack-developer`: ghi vào `*/src/` để fix root cause
- Không agent nào sửa cả 2 đồng thời

### 5.4 Stop conditions (khi nào AI tự dừng)

Cấu hình mặc định cho agent:
- **Stop xanh:** all target tests pass + coverage ≥ ngưỡng
- **Stop fail:** retry 3 lần ở cùng test, vẫn đỏ → escalate báo user
- **Token budget:** cap 80k tokens / wave (xem brainstorm)
- **Time budget:** cap 30 phút / wave

### 5.5 Cấp quyền cho agent (autonomous mode)

Trong `~/.claude/settings.json` hoặc `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(pytest:*)",
      "Bash(npx vitest:*)",
      "Bash(npx playwright:*)",
      "Bash(npm test*)",
      "Bash(npm install:*)",
      "Edit", "Write"
    ]
  }
}
```

---

## 5b. Live UI verification — Chrome DevTools MCP

**Khi nào dùng:** Playwright cho **automated regression** (chạy trong CI, headless). Chrome DevTools MCP cho **live verification** trong session AI — agent xem trang thật, đọc console, click element, take screenshot để confirm UI trước khi report DONE.

### Setup (1 lần)

MCP server `chrome-devtools` đã có sẵn trong Claude Code config. Verify:
```
@assistant /mcp                  # liệt kê MCP servers active
```
Nếu chưa thấy `chrome-devtools` → cài: xem [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp).

### Tools quan trọng

| Tool | Mục đích |
|---|---|
| `list_pages` | Xem tab đang mở |
| `new_page` / `navigate_page` | Mở/điều hướng URL |
| `take_snapshot` | DOM snapshot text-based (giá rẻ token) |
| `take_screenshot` | PNG/JPEG (xem layout) |
| `list_console_messages` | Lỗi JS + warning |
| `list_network_requests` | API calls + status |
| `click` / `fill` / `fill_form` | Tương tác |
| `evaluate_script` | Chạy JS trong page |
| `lighthouse_audit` | Performance/A11y/SEO score |
| `performance_start_trace` / `_stop_trace` | Trace performance bottleneck |

### Quy trình live-check (trong session AI)

```
1. Bash: cd web && npm run dev               (background)
2. Bash: cd api && uvicorn src.v2_main:app   (background)
3. Wait 10s → MCP: navigate_page http://localhost:3000
4. MCP: take_screenshot → review render
5. MCP: list_console_messages → 0 errors expected
6. MCP: take_snapshot → verify text content + element ids
7. MCP: click/fill cho user flow
8. MCP: list_network_requests → verify API hit + status 200
9. Cleanup: kill background servers
```

### Khi nào dùng MCP vs Playwright

| Yêu cầu | Tool |
|---|---|
| CI regression, deterministic | **Playwright** |
| AI agent quick visual sanity check | **MCP chrome-devtools** |
| Debug 1 lỗi UI cụ thể | **MCP** (interactive) |
| Performance baseline | **MCP** `lighthouse_audit` + `performance_*` |
| 5 scenarios E2E, run 100 lần / tuần | **Playwright** (fast, headless) |
| Verify "agent đã render đúng kết quả" | **MCP** + screenshot vào report |

### Smoke đã chạy (verified 2026-04-27)

- Started `web` dev server: ✅ ready @ localhost:3000
- Started `api` dev server: ✅ ready @ localhost:8000
- `navigate_page localhost:3000` → ✅ login page render đúng
- `take_screenshot fullPage` → `plans/reports/screenshot-260427-0210-web-home.png`
- `list_console_messages` → 1 cảnh báo `autocomplete` (chưa critical)

---

## 6. Quy trình chuẩn theo Wave (tham chiếu)

Xem chi tiết: `plans/260427-1006-bumblebee-2-architecture/test-scenario.md`

| Wave | Lệnh chạy | Gate xanh = |
|---|---|---|
| W1 Backend Unit | `pytest api/src/workflow/tests api/tests/v2 --cov=api/src/workflow --cov=api/src/agents --cov-fail-under=75` | coverage ≥75% |
| W2 Backend Integration | `pytest api/tests/v2/integration --cov=api/src --cov-fail-under=70` | coverage ≥70% |
| W3 Frontend | `cd web && npm test && npx playwright test` | 5 scenarios pass, vitest ≥60% |
| W4 CLI | `cd cli-ts && npm test -- --coverage` | coverage ≥70% |
| W5 Regression+Perf+Real | `python scripts/run-regression.py && python scripts/perf-baseline.py` | 12/12 pass, p95<500ms |

---

## 7. Troubleshooting

| Lỗi | Khắc phục |
|---|---|
| `ModuleNotFoundError: pytest` | Activate env `bb`: `conda activate bb` hoặc đặt `BB_PYTHON=<path>` |
| `ERESOLVE` khi `npm install` | Thêm `--legacy-peer-deps` (script setup đã handle) |
| `Cannot find module '@testing-library/dom'` | `cd web && npm i -D @testing-library/dom` |
| Playwright `browserType.launch: Executable doesn't exist` | `cd web && npx playwright install chromium` |
| pytest `Database connection refused` | Check `DATABASE_URL` trong `api/.env`; ping DB: `Test-NetConnection db.sidcorp.co -Port 15434` (PowerShell) |
| Vitest `No test files found` | Đặt file đúng pattern `**/*.{test,spec}.{ts,tsx}` trong include glob của `vitest.config.ts` |
| `RuntimeWarning: coroutine was never awaited` | Test dùng async fixture mà không đánh dấu — thêm `@pytest.mark.asyncio` hoặc set `asyncio_mode = "auto"` (đã set) |
| Web E2E hang waiting `localhost:3000` | `cd web && npm run dev` ở terminal khác trước, hoặc set `BASE_URL=http://...` để skip auto-server |
| MSW lỗi `Cannot find handler` | Thêm route vào `cli-ts/tests/mocks/handlers.ts` |
| Vitest coverage 0% mặc dù tests pass | Check `coverage.include` trong `vitest.config.ts`; đảm bảo file production import đúng path |

---

## 8. CI hint (cho khi triển khai `.github/workflows/test.yml`)

```yaml
jobs:
  backend:
    steps:
      - uses: conda-incubator/setup-miniconda@v3
        with: { environment-file: environment.yml, activate-environment: bb }
      - run: pytest api/tests/v2 api/src/workflow/tests --cov --cov-fail-under=70
  web:
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: cd web && npm ci --legacy-peer-deps
      - run: cd web && npm test
      - run: cd web && npx playwright install --with-deps chromium
      - run: cd web && npm run test:e2e
  cli:
    steps:
      - uses: actions/setup-node@v4
      - run: cd cli-ts && npm ci --legacy-peer-deps && npm test -- --coverage
```

---

## 9. Checklist daily

Trước khi commit:
- [ ] `bash scripts/test-all.sh --no-e2e` xanh
- [ ] Coverage không tụt so với main
- [ ] File mới có test riêng
- [ ] `git status` không sót `.env*` hoặc artifact

Trước khi merge PR:
- [ ] CI xanh tất cả jobs
- [ ] E2E pass full
- [ ] Reviewed bằng `code-reviewer` agent
- [ ] Coverage threshold không hạ
