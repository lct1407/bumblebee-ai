<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# 🐝 Bumblebee

**Multi-agent AI task management — your AI dev team in a box.**

Tạo issue → AI phân tích codebase → đề xuất phương án → bạn approve → AI tự thực thi trên máy bạn → merge sang staging → chạy e2e/smoke → release.

[Bắt đầu](#bắt-đầu-trong-3-phút) · [Tính năng](#tính-năng) · [Hướng dẫn](docs/user-guide-vi.md) · [Self-host](#self-hosting) · [Documentation](docs/README.md)

</div>

---

## Bumblebee giải quyết vấn đề gì?

Bạn có Claude Code / Cursor / Codex và đã biết AI viết được code. Nhưng:

- Mỗi lần phải copy-paste context vào AI tool.
- Không có nơi quản lý "AI đã làm gì cho repo của tôi tuần này".
- Không biết task nào AI tự làm được, task nào cần bạn duyệt.
- Không có audit trail cho team / khách hàng / compliance.

**Bumblebee** là server quản lý tasks, có agent chạy local trên máy bạn, được điều phối bởi 11 vai trò chuyên biệt (Triager, Implementer, Reviewer, Merger, ...), với approval gates theo độ phức tạp.

## Tính năng

| Phần | Mô tả |
|---|---|
| 🎯 **Issue intake thông minh** | Triager agent tự classify complexity (simple/medium/complex) + sinh acceptance criteria + scope hints |
| ✅ **Approval gate** | Issue đơn giản → AI tự chạy. Phức tạp → chờ bạn duyệt. Cấu hình per-project. |
| 🤖 **11 vai trò AI** | Triager, Planner, Coordinator, Implementer, Tester, Reviewer, Integrator, Merger, Documenter, Assistant, Failure Diagnostician |
| 💻 **Worker daemon trên máy bạn** | `bb daemon` pull task từ server, chạy Claude CLI / git / tests local — code không bao giờ rời máy bạn |
| 🔗 **Tích hợp Claude Code / Cursor / Codex** | `bb skills install --target=claude-code` ship 11 role prompts vào repo |
| 🌿 **Git flow tích hợp** | feature branch → review → merge stg → e2e/smoke gates → release tới main |
| 🐙 **GitHub webhook** | PR + Issue tự sync 2 chiều |
| 💳 **Billing sẵn sàng** | Stripe checkout + 3 plans (Free / Pro $20 / Team $100 + metered LLM cost) |
| 🔐 **Multi-tenant SaaS** | Workspaces + roles (Owner/Admin/Member/Viewer) + JWT/OAuth + audit log |
| 📡 **MCP server** | Claude Desktop, Cursor, web client gọi được qua MCP |
| 🔎 **GraphQL + REST** | GraphQL cho client (web/CLI), REST cho webhooks, RPC cho MCP, WebSocket realtime |

## Bắt đầu trong 3 phút

### Cách 1 — Đăng ký SaaS (sẽ ra mắt)

> Bumblebee Cloud đang ở giai đoạn beta. [Đăng ký waitlist](https://bumblebee.dev) để được mời sớm.

### Cách 2 — Self-host

```bash
# 1. Clone + cài đặt
git clone https://github.com/lct1407/bumblebee
cd bumblebee
pip install -e .

# 2. Up Postgres + chạy migrations + seed
docker compose up -d
alembic upgrade head
python -m bumblebee.seeds.seed_default

# 3. Start backend + web
uvicorn bumblebee.main:app --reload --port 8000      # API server
cd web && npm install && npm run dev                  # Web at :3000
```

Mở `http://localhost:3000` → đăng ký → tạo workspace → bắt đầu dùng.

### Bước tiếp theo — link máy bạn để chạy tasks

```bash
# Trên máy bạn (nơi có code repo của bạn)
bb device pair --server http://localhost:8000

# In ra pairing code 8 ký tự, ví dụ: ABCD1234
# Mở web → Settings → Devices → nhập code → web trả về node_token

bb device save-token <token-từ-web>

# Start worker daemon (sẽ pull tasks về chạy)
bb daemon --server http://localhost:8000
```

Xong! Bây giờ tạo issue trên web, AI sẽ tự nhặt task về máy bạn để xử lý.

## Tích hợp với Claude Code / Cursor / Codex

Bumblebee có sẵn 11 role prompts được tinh chỉnh kỹ. Ship vào repo của bạn để Claude Code / Cursor / Codex dùng được:

```bash
cd /path/to/your/project

# Cho Claude Code
bb skills install --target=claude-code

# Cho Cursor
bb skills install --target=cursor

# Cho OpenAI Codex
bb skills install --target=codex

# Vendor-neutral (.bumblebee/agents/)
bb skills install --target=generic
```

Lần sau bạn mở Claude Code trong repo, có thể bảo nó: _"Act as the Bumblebee Reviewer role and review my PR"_ — Claude sẽ đọc `.claude/agents/bumblebee-reviewer.md` và follow đúng system prompt + budget.

## CLI tham khảo

```bash
bb login <username>                      # Đăng nhập, lưu token
bb whoami                                # Xem workspace hiện tại
bb issue list --project bb               # List issues
bb issue create "fix login bug"          # Tạo issue mới
bb device pair                           # Pair máy này làm worker
bb daemon                                # Run worker
bb skills install --target=claude-code   # Ship role prompts
bb skills targets                        # List target options
bb mcp                                   # Start MCP server (stdio)
bb server                                # Start API server
```

Đầy đủ: `bb --help` hoặc xem [docs/user-guide-vi.md](docs/user-guide-vi.md).

## Architecture nhanh

```
┌────────── Web (Next.js) ──────────┐    ┌─────── Claude Desktop / Cursor ───────┐
│  React Query + GraphQL hooks      │    │              MCP client                │
└──────────────────┬─────────────────┘    └───────────────┬───────────────────────┘
                   │                                       │
                   ▼                                       ▼
       ┌──────────────────── FastAPI app ───────────────────┐
       │   GraphQL /graphql  ·  REST /api/*  ·  MCP RPC      │
       │   ├─ Control (LangGraph workflow engine)            │
       │   ├─ Dispatch (PG SKIP LOCKED task queue)           │
       │   ├─ Execution (LLM harness + context assembler)    │
       │   ├─ Safety (approval gate · budget · loop detect)  │
       │   ├─ State (event log + projections)                │
       │   └─ Billing (Stripe + quotas + webhooks)           │
       └──────────────────────┬──────────────────────────────┘
                              │
                ┌─────────────┼──────────────┐
                ▼                            ▼
        PostgreSQL 16              ┌─ bb daemon (your machine) ─┐
        + event log                │  pulls tasks → runs git/   │
                                   │  Claude CLI → reports back │
                                   └────────────────────────────┘
```

7 planes: Control · Dispatch · Execution · State · Safety · Tool · Observability. [Chi tiết](docs/architecture-overview.md).

## Stack

- **Backend** Python 3.12 · FastAPI · SQLAlchemy 2.0 async · LangGraph · Strawberry GraphQL · Alembic
- **DB** PostgreSQL 17 (multi-tenancy via 13 scoped tables)
- **Frontend** Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · React Query
- **Auth** JWT + X-BB-API-Key + Google OAuth (Authlib)
- **LLM** Vertex AI / Gemini + Claude CLI (subprocess provider)
- **MCP** Stdio (Claude Desktop/Cursor) + Streamable HTTP (web clients)
- **Billing** Stripe Checkout + webhook handlers + per-workspace quotas

## Self-hosting

Self-host phù hợp khi:
- Bạn có infra sẵn (Postgres, K8s/Docker)
- Cần code không rời môi trường (compliance, IP-sensitive)
- Muốn customize role prompts, workflows, billing logic

| Tài liệu | Nội dung |
|---|---|
| [docs/user-guide-vi.md](docs/user-guide-vi.md) | Hướng dẫn cài đặt + sử dụng cho người dùng cuối (tiếng Việt) |
| [docs/getting-started.md](docs/getting-started.md) | Dev setup chi tiết |
| [docs/architecture-overview.md](docs/architecture-overview.md) | 7-plane architecture |
| [docs/database-schema.md](docs/database-schema.md) | 14 tables schema |
| [docs/api-reference.md](docs/api-reference.md) | REST + GraphQL endpoints |
| [docs/mcp-integration.md](docs/mcp-integration.md) | MCP server + tool catalog |
| [docs/flow-walkthroughs.md](docs/flow-walkthroughs.md) | End-to-end use case flows |
| [docs/disaster-recovery.md](docs/disaster-recovery.md) | Backup/restore/runbook |

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold + 7-plane skeleton | ✅ |
| 1 | Single-agent E2E + event log | ✅ |
| 2 | Safety services + OTel | ✅ |
| 3 | ScopeLease + concurrent issues | ✅ |
| 4 | Web MVP + Coordinator | ✅ |
| 5 | Failure taxonomy + replay | ✅ |
| 6 | Knowledge + Skills + AgentDefinition | ✅ |
| 7 | ChatSession + Notifications | ✅ |
| A | Workspace tenancy | ✅ |
| B | MCP server | ✅ |
| C | Eval harness + Defense Baseline | ✅ |
| D | Stripe billing + quotas | ✅ |
| E | OAuth + audit | ✅ |
| F | Polish + landing | ✅ |
| **G** | **Device pairing + worker daemon** | **🚧 scaffolded, daemon shell-exec only** |
| **H** | **Complexity router + approval gate** | **✅** |
| **I** | **Staging flow + GitHub webhook** | **✅ payload mapping, push-event TBD** |
| **Commercial MVP** | **Real LLM provider · Web UI for device pair · source-aware context · ToS/Privacy · Sentry · backup cron** | **⏳ ≈ 6–10 tuần** |

Xem [docs/phases-status.md](docs/phases-status.md) cho chi tiết.

## Đóng góp

PR và issue đều welcome. Trước khi PR:
- Đọc [CLAUDE.md](CLAUDE.md) (project conventions cho AI assistants)
- Đọc [.claude/rules/development-rules.md](.claude/rules/development-rules.md)
- Chạy `pytest` (153 tests, target 0 failures)

## License

Proprietary — internal SidCorp project. Liên hệ thanhlc@sidcorp.co để thương mại.
