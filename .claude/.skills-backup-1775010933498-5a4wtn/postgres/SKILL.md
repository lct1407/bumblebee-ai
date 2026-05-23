---
name: postgres
description: |
  Execute safe read-only SQL queries against the Bumblebee PostgreSQL database
  for debugging, data inspection, and schema exploration. Use when:
  (1) inspecting work items, comments, sprints, or other data directly,
  (2) debugging data issues or verifying migration results,
  (3) exploring table schemas and relationships,
  (4) checking database state during development.
---

# Postgres Skill

Execute safe, read-only SQL queries against the Bumblebee PostgreSQL database for debugging and data inspection.

## Overview

This skill provides a standalone Python script that connects to the Bumblebee PostgreSQL database and executes read-only queries. All write operations are blocked at both the query validation and session level. Designed for safe use by agents and developers who need to inspect data without risk of modification.

## Setup

Connection info is read automatically from `api/.env` (the `DATABASE_URL` environment variable). No additional configuration is needed.

- **Host**: `db.sidcorp.co:15434`
- **Driver**: psycopg2 (synchronous, standalone script)
- **Source**: `api/.env` contains `DATABASE_URL=postgresql+asyncpg://user:pass@host:port/dbname`

The script parses the DATABASE_URL and converts the `postgresql+asyncpg://` scheme to a standard `postgresql://` connection string for psycopg2.

## Usage

### List all tables

```bash
python3 .claude/skills/postgres/scripts/query.py --tables
```

### Run a query

```bash
python3 .claude/skills/postgres/scripts/query.py --query "SELECT * FROM work_items LIMIT 10"
```

### Inspect table schema

```bash
python3 .claude/skills/postgres/scripts/query.py --schema work_items
```

### Limit rows returned

```bash
python3 .claude/skills/postgres/scripts/query.py --query "SELECT * FROM work_items" --limit 50
```

## Safety

All queries are validated and restricted to prevent accidental or intentional data modification:

- **Read-only session**: The database session is set to `READ ONLY` mode via `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`
- **Query validation**: Only `SELECT`, `SHOW`, `EXPLAIN`, and `WITH` statements are allowed
- **Write blocking**: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, and `TRUNCATE` are explicitly blocked with a clear error message
- **Single statement**: Only one SQL statement per execution (semicolon-separated multi-statements are rejected)
- **Timeout**: 30-second statement timeout to prevent long-running queries
- **Row limit**: Maximum 10,000 rows returned per query (configurable via `--limit`)

## Common Bumblebee Queries

### Work items by status

```sql
SELECT id, number, title, status, type, priority, assignee
FROM work_items
WHERE status = 'open' AND deleted_at IS NULL
ORDER BY number;
```

### Project hierarchy (work items with parent relationships)

```sql
SELECT wi.number, wi.title, wi.type, wi.status,
       p.number AS parent_number, p.title AS parent_title
FROM work_items wi
LEFT JOIN work_items p ON wi.parent_id = p.id
WHERE wi.deleted_at IS NULL
ORDER BY COALESCE(p.number, wi.number), wi.number;
```

### Agent comments on work items

```sql
SELECT c.id, c.body, c.comment_type, c.created_at,
       wi.number AS item_number, wi.title AS item_title
FROM comments c
JOIN work_items wi ON c.work_item_id = wi.id
WHERE c.comment_type IN ('agent_suggestion', 'agent_execution', 'agent_test')
ORDER BY c.created_at DESC
LIMIT 20;
```

### Sprint items (work items in a specific sprint)

```sql
SELECT wi.number, wi.title, wi.status, wi.type, wi.assignee,
       s.name AS sprint_name
FROM work_items wi
JOIN sprints s ON wi.sprint_id = s.id
WHERE s.name ILIKE '%sprint%'
  AND wi.deleted_at IS NULL
ORDER BY wi.number;
```

### Recent work item events (activity history)

```sql
SELECT wie.id, wie.field_name, wie.old_value, wie.new_value, wie.created_at,
       wi.number, wi.title
FROM work_item_events wie
JOIN work_items wi ON wie.work_item_id = wi.id
ORDER BY wie.created_at DESC
LIMIT 20;
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `psycopg2` not installed | `pip install psycopg2-binary` |
| `tabulate` not installed | Output falls back to simple tab-separated format |
| Connection refused | Check that `api/.env` exists and DATABASE_URL is correct |
| Permission denied | The script runs read-only; check DB user permissions |
| Query timeout | Simplify query or add tighter `LIMIT`; default timeout is 30s |
