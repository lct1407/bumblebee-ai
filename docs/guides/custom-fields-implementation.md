# Custom Fields — Step-by-Step Implementation Guide

Hướng dẫn từng bước sử dụng BB workflow để implement feature Custom Fields.

---

## Overview

Cho phép projects định nghĩa custom fields (number, float, list/combo, date, datetime, short text, long text) trên work items. Fields có thể:
- **Global** — mặc định cho tất cả projects
- **Per-project** — chỉ cho project cụ thể
- **Per-type** — chỉ cho loại work item cụ thể (bug, story, task...)

---

## Step 1: Tạo Work Items

### Smart Create (Recommended)

`bb item create` sử dụng Claude CLI để AI phân tích và đề xuất:

```
$ bb item create "custom fields cho work items"

◆ Create Work Item

◇ Mô tả thêm ý tưởng (Enter để dùng title):
│ Cho phép thêm custom fields vào work items, hỗ trợ number,
│ float, select, date, text. Set default cho project hoặc
│ theo loại task. Cần UI trong settings và hiện trên detail page.

◐ AI đang phân tích...
◇ Phân tích xong

◆ AI đề xuất:
  Type:     epic
  Priority: high
  Title:    Custom Fields — definitions, values, UI
  Description:
    Cho phép projects định nghĩa custom fields...
  Sub-tasks (5):
    • [task]  DB schema: custom_field_definitions
    • [task]  API endpoints: CRUD + get/set values
    • [task]  MCP tool: bumblebee_custom_fields
    • [story] Web UI: settings editor + detail page
    • [task]  CLI: show custom fields in item show

◆ Tạo epic + 5 sub-tasks? (Y/n)

  ✔ Created epic BB-65: Custom Fields — definitions, values, UI
  ✔ Created task BB-66: DB schema: custom_field_definitions
  ✔ Created task BB-67: API endpoints: CRUD + get/set values
  ✔ Created task BB-68: MCP tool: bumblebee_custom_fields
  ✔ Created story BB-69: Web UI: settings editor + detail page
  ✔ Created task BB-70: CLI: show custom fields in item show

◇ Done
```

**Flow** (implemented in `cli-ts/src/commands/item.ts`):
1. User nhập title ngắn
2. BB hỏi mô tả chi tiết (via `@clack/prompts`) → **đây là input chính cho AI**
3. Nếu user Enter skip → AI dùng title làm fallback
4. AI phân tích via `claude -p` → đề xuất type, priority, description, sub-tasks
5. User confirm hoặc cancel
6. Tự động tạo parent item + tất cả sub-tasks

**Skip AI** khi đã biết rõ thông tin:
```bash
# Đủ type + priority → tạo trực tiếp, không hỏi AI
bb item create "Fix login 500 error" --type bug --priority critical

# Force skip AI
bb item create "quick note" --no-enrich
```

### Manual (Full Control)

Nếu muốn tự kiểm soát hoàn toàn:

```bash
# Tạo epic chính
bb item create "Custom Fields — field definitions, values, API/UI" \
  --type epic --priority high --no-enrich

# Tách thành 5 tasks (giả sử epic là BB-65)
bb item create "DB schema: custom_field_definitions + custom_field_values tables" \
  --type task --parent BB-65 --priority high --no-enrich

bb item create "API endpoints: CRUD field definitions + get/set field values" \
  --type task --parent BB-65 --priority high --no-enrich

bb item create "MCP tool: bumblebee_custom_fields for Claude/IDE integration" \
  --type task --parent BB-65 --priority medium --no-enrich

bb item create "Web UI: field editor in project settings + fields on detail page" \
  --type story --parent BB-65 --priority medium --no-enrich

bb item create "CLI support: show custom fields in item show/list" \
  --type task --parent BB-65 --priority low --no-enrich
```

Verify:
```bash
bb item children BB-65
```

---

## Step 2: Agent Suggest cho Task 1 (DB Schema)

```bash
bb agent suggest BB-66
```

Agent sẽ phân tích codebase và post proposal. Proposal nên bao gồm schema design sau:

### Bảng `custom_field_definitions`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(100) | Field name (e.g. "Story Points", "Sprint Velocity") |
| slug | VARCHAR(100) | URL-safe key (e.g. "story_points") |
| field_type | VARCHAR(20) | `number`, `float`, `text`, `textarea`, `date`, `datetime`, `select` |
| description | TEXT | Optional help text |
| options | JSONB | For `select` type: `["option1", "option2", ...]` |
| default_value | TEXT | Default value khi tạo mới |
| is_required | BOOLEAN | Bắt buộc hay không |
| scope | VARCHAR(20) | `global` (all projects), `project` (specific projects) |
| project_id | INT FK NULL | NULL = global, set = project-specific |
| applies_to_types | JSONB | `null` = all types, `["bug", "story"]` = specific types |
| sort_order | INT | Thứ tự hiển thị |
| is_active | BOOLEAN | Soft toggle |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Bảng `custom_field_values`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| field_definition_id | INT FK | → custom_field_definitions |
| work_item_id | INT FK | → work_items |
| value_text | TEXT | For text/textarea |
| value_number | FLOAT | For number/float |
| value_date | TIMESTAMPTZ | For date/datetime |
| value_json | JSONB | For select (multi) or complex |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint:** `(field_definition_id, work_item_id)` — mỗi field chỉ có 1 value per item.

Review proposal:
```bash
bb comment list BB-66
```

---

## Step 3: Execute Task 1 (DB Schema)

Sau khi review proposal OK:

```bash
bb agent execute BB-66
```

Agent sẽ:
1. Tạo branch `feat/bb-66_custom-field-definitions`
2. Tạo model files:
   - `api/src/models/custom_field.py`
3. Tạo Alembic migration:
   - `cd api && alembic revision --autogenerate -m "add custom fields tables"`
4. Update `api/src/models/__init__.py`

Verify:
```bash
bb item show BB-66          # Status: in_review
bb agent worktrees          # Thấy worktree cho item-66
```

Test migration:
```bash
cd api && alembic upgrade head
```

Merge nếu OK:
```bash
bb agent merge --target release/dev
bb item update BB-66 --status done
```

---

## Step 4: Agent Suggest + Execute Task 2 (API Endpoints)

```bash
bb agent suggest BB-67
```

Proposal nên bao gồm các endpoints:

### Field Definitions (Project Settings)

```
GET    /api/projects/{slug}/custom-fields          — List definitions (filter: type)
POST   /api/projects/{slug}/custom-fields          — Create definition
PUT    /api/custom-fields/{id}                     — Update definition
DELETE /api/custom-fields/{id}                     — Soft delete/deactivate
GET    /api/custom-fields/global                   — List global definitions
```

### Field Values (Work Item)

```
GET    /api/work-items/{id}/custom-fields          — Get all field values for item
PUT    /api/work-items/{id}/custom-fields          — Set/update field values (bulk)
```

### Request/Response Examples

```json
// POST /api/projects/bumblebee-cli/custom-fields
{
  "name": "Environment",
  "slug": "environment",
  "field_type": "select",
  "options": ["production", "staging", "development"],
  "is_required": false,
  "applies_to_types": ["bug", "task"],
  "scope": "project"
}

// PUT /api/work-items/42/custom-fields
{
  "fields": [
    { "slug": "environment", "value": "production" },
    { "slug": "estimated_hours", "value": 4.5 }
  ]
}

// GET /api/work-items/42/custom-fields
{
  "fields": [
    {
      "slug": "environment",
      "name": "Environment",
      "field_type": "select",
      "value": "production",
      "options": ["production", "staging", "development"]
    },
    {
      "slug": "estimated_hours",
      "name": "Estimated Hours",
      "field_type": "float",
      "value": 4.5
    }
  ]
}
```

Review rồi execute:
```bash
bb comment list BB-67       # Review proposal
bb agent execute BB-67      # Implement
bb agent test BB-67         # Run tests
bb agent merge --target release/dev
bb item update BB-67 --status done
```

---

## Step 5: Agent Suggest + Execute Task 3 (MCP Tool)

```bash
bb agent suggest BB-68
```

MCP tool cho Claude/IDE:

```python
# Thêm vào api/src/mcp/server.py

@mcp.tool()
async def bumblebee_custom_fields(
    action: str,                    # list_definitions, get_values, set_values
    project_slug: str | None = None,
    work_item_id: str | None = None,
    data: str | None = None,
) -> str:
    """Manage custom fields on work items.
    - list_definitions: list field definitions for a project (requires project_slug)
    - get_values: get custom field values for a work item (requires work_item_id)
    - set_values: set custom field values (requires work_item_id + data JSON)
    """
```

Cho phép Claude trong bất kỳ IDE nào:
```
bumblebee_custom_fields(action="list_definitions", project_slug="bumblebee-cli")
bumblebee_custom_fields(action="get_values", work_item_id="42")
bumblebee_custom_fields(action="set_values", work_item_id="42", data='{"fields":[{"slug":"env","value":"prod"}]}')
```

```bash
bb agent execute BB-68
bb agent merge --target release/dev
bb item update BB-68 --status done
```

---

## Step 6: Agent Suggest + Execute Task 4 (Web UI)

```bash
bb agent suggest BB-69
```

### 2 nơi cần UI:

### A. Project Settings — Custom Fields tab

```
/projects/[slug]/settings → "Custom Fields" tab

┌─────────────────────────────────────────────────────────┐
│ Custom Fields                          [+ Add Field]    │
├─────────────────────────────────────────────────────────┤
│ Name            Type      Applies To    Required  Actions│
│ Environment     select    bug, task     No        ✏️ 🗑   │
│ Est. Hours      float     all           No        ✏️ 🗑   │
│ Release Version text      feature       Yes       ✏️ 🗑   │
└─────────────────────────────────────────────────────────┘
```

### B. Work Item Detail — Custom Fields section

```
┌─ Metadata Sidebar ──────────────┐
│ Status: in_progress             │
│ Priority: high                  │
│ Assignee: @thanhlc              │
│ Sprint: Sprint 5                │
│                                 │
│ ── Custom Fields ──             │
│ Environment: [production ▾]     │
│ Est. Hours:  [4.5        ]      │
│ Release:     [v2.1.0     ]      │
└─────────────────────────────────┘
```

### Components cần tạo

```
web/src/components/custom-fields/
├── field-definition-list.tsx    — Table of definitions (settings page)
├── field-definition-form.tsx    — Create/edit field dialog
├── field-value-editor.tsx       — Render correct input per field_type
├── field-values-section.tsx     — Group of fields on detail sidebar
└── field-type-icon.tsx          — Icon per field type
```

```bash
bb agent execute BB-69
bb agent merge --target release/dev
bb item update BB-69 --status done
```

---

## Step 7: Task 5 (CLI) + Merge to Production

```bash
bb agent suggest BB-70
bb agent execute BB-70
```

CLI changes:
```bash
# bb item show BB-42 sẽ hiện thêm custom fields
bb item show BB-42
# Output:
# #42 [bug] Fix auth middleware
# Status: in_progress | Priority: high
# Custom Fields:
#   Environment: production
#   Est. Hours: 4.5

# Set custom field via CLI
bb item update BB-42 --field environment=staging
bb item update BB-42 --field estimated_hours=8
```

```bash
bb agent merge --target release/dev
bb item update BB-70 --status done
```

---

## Step 8: Merge Epic to Production

```bash
# Merge release/dev → master
git checkout master
git merge release/dev --no-edit
git push origin master

# Close epic
bb item update BB-65 --status done
```

---

## Execution Order

```
BB-66 (DB schema)     ──→ must be first
BB-67 (API endpoints) ──→ depends on BB-66
BB-68 (MCP tool)      ──→ depends on BB-67, can parallel with BB-69
BB-69 (Web UI)        ──→ depends on BB-67, can parallel with BB-68
BB-70 (CLI)           ──→ depends on BB-67, can parallel with BB-68/69
```

```
Week 1: BB-66 → BB-67
Week 2: BB-68 + BB-69 + BB-70 (parallel)
```

---

## Quick Commands Cheat Sheet

```bash
# Full cycle per task
bb agent suggest BB-XX          # 1. Analyze & propose
bb comment list BB-XX           # 2. Review proposal
bb agent execute BB-XX          # 3. Implement
bb agent test BB-XX             # 4. Test (optional)
bb agent merge --target release/dev  # 5. Merge
bb item update BB-XX --status done   # 6. Close

# Or auto run (skip manual review)
bb agent run BB-XX -y --auto-merge --target release/dev

# Parallel execution for independent tasks
bb agent batch-run BB-68 BB-69 BB-70 --auto-merge --target release/dev
```
