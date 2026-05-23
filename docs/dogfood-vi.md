# Bumblebee tự dùng Bumblebee — dogfood setup

Dự án Bumblebee giờ tự đăng ký làm 1 project trong chính nó. Mọi yêu cầu cải tiến + bug fix đều log thành issue → AI agents xử lý → merge sang `stg` → release.

## Setup hiện tại

```yaml
Project:  Bumblebee (key: BB)
Repo:     D:/Source/bumblebee
Base:     main
Staging:  stg
Policy:
  auto_execute_simple: false       # mọi task cần manual approve
  workflow_overrides:
    complex: feature-complex-flow  # Coordinator + parallel implementers
Workspace: Default Workspace (default)
```

## 15 issues đã seed

| # | Title | Cx | Pri | Status |
|---|---|---|---|---|
| BB-1 | Add /health/db endpoint | - | medium | new |
| BB-2 | Fix bcrypt cost factor too low | - | high | new |
| BB-3 | Implement OAuth2 login (Google) | - | high | new |
| **BB-4** | **fix: Wire real LLM provider in agent harness (replace stub)** | **complex** | **critical** | triaged |
| **BB-5** | **feat: Source-aware context builder reads file contents matching scope_hints** | complex | high | triaged |
| BB-6 | feat: bb daemon invokes Claude CLI per role instead of shell command | medium | high | triaged |
| BB-7 | fix: Audit GraphQL resolvers for require_permission enforcement | medium | high | triaged |
| BB-8 | feat: Legal pages (ToS + Privacy) + transactional emails | medium | medium | triaged |
| BB-9 | ops: Sentry + Prometheus metrics + nightly DB backup cron | medium | medium | triaged |
| **BB-10** | **fix: Rotate placeholder secrets before prod** | simple | critical | triaged |
| BB-11 | feat: Migrate web pages from REST to GraphQL hooks (incremental) | complex | medium | triaged |
| BB-12 | feat: Web UI for issue Approve + Trigger Workflow buttons | medium | high | triaged |
| BB-13 | feat: GitHub webhook push event auto-creates issue | medium | low | triaged |
| BB-14 | test: Add pytest coverage for new modules (daemon, installer, graphql) | medium | medium | triaged |
| BB-15 | feat: Project repo linking UI with git URL validation | medium | medium | triaged |

**BB-4 và BB-5 là 2 blockers core value-prop.**
**BB-10 critical bảo mật** trước khi đụng prod.

## Workflow khuyến nghị

```
BB-10 (simple + critical) → approve → simple-fix-flow → merge stg
BB-4  (complex + critical) → approve → feature-complex-flow → merge stg
BB-5  (complex + high)    → approve → feature-complex-flow
BB-6, BB-7 (medium + high) → batch 2-3 issues / sprint
BB-8..15 → backlog
```

## Cách thêm issue mới

### Qua web

`http://localhost:3000/issues` → **+ New Issue** → fill → submit. Triager tự classify.

### Qua GraphQL

```bash
curl -X POST http://localhost:8000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"query":"mutation($i:IssueCreateInput!){createIssue(input:$i){number title}}",
       "variables":{"i":{"projectId":"5c7f3a8c-4b7c-403d-8ea4-3b35146d781e",
                          "title":"...","description":"...","priority":"HIGH"}}}'
```

### Qua CLI

```bash
bb login <username>
bb issue create "Fix bug X in module Y" --project bb --priority high
```

### Qua MCP (từ Claude Desktop)

Hỏi Claude: _"Create a Bumblebee issue in project bb: Title 'Refactor X'"_. Claude gọi `bumblebee_issues(action='create', ...)` tool.

## Cách run issue qua AI agent (khi LLM provider được wire xong — BB-4)

1. Open issue trên web → đọc AI Suggested Solution
2. Click **Approve** (status → APPROVED)
3. Click **Trigger Workflow** → backend chọn workflow theo complexity:
   - simple → simple-fix-flow
   - complex → feature-complex-flow
4. Worker daemon ở máy bạn pull task về chạy
5. Theo dõi realtime ở Activity tab

## Verify

```bash
# DB-level verify
cd D:/Source/bumblebee && PYTHONPATH=. python -c "
import asyncio
from sqlalchemy import select
from bumblebee.database import SessionLocal
from bumblebee.models.project import Project
from bumblebee.models.issue import Issue

async def main():
    async with SessionLocal() as db:
        p = (await db.execute(select(Project).where(Project.slug=='bb'))).scalar_one()
        print('Repo:', p.repo_path)
        issues = (await db.execute(select(Issue).where(Issue.project_id==p.id))).scalars().all()
        print(f'{len(issues)} issues')
asyncio.run(main())
"
```

## Re-seed nếu cần

```bash
PYTHONPATH=. python scripts/seed-bumblebee-improvement-issues.py
```

Script idempotent — skip titles đã tồn tại.

---

**Created:** 2026-05-23
