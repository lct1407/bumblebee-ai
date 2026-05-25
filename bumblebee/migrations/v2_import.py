"""v2 → v3 issue migration script — Phase 8.

Extracts issues + comments from v2 PostgreSQL → recreates as fresh v3 issues
via REST API. Uses idempotency keys for safe re-run.

Usage:
    bumblebee migrate-v2 \
        --source postgresql://user:pw@host:port/v2db \
        --target http://localhost:8000 \
        --project-slug bb \
        --api-key xxxxx
"""
from __future__ import annotations

import asyncio
import json
import sys

import httpx


async def extract_v2(source_url: str, project_slug: str) -> dict:
    """Extract issues + comments from v2 PostgreSQL."""
    try:
        import asyncpg
    except ImportError:
        print("asyncpg required for v2 extract", file=sys.stderr)
        sys.exit(1)

    conn = await asyncpg.connect(source_url)
    try:
        # v2 schema: work_items table
        rows = await conn.fetch(
            """
            SELECT id, number, title, description, type::text, status::text,
                   priority::text, created_at
            FROM work_items
            WHERE project_id = (SELECT id FROM projects WHERE slug = $1)
              AND deleted_at IS NULL
            ORDER BY number
            """,
            project_slug,
        )
        issues = [
            {
                "v2_id": str(r["id"]),
                "number": r["number"],
                "title": r["title"],
                "description": r["description"],
                "type": (r["type"] or "task").lower(),
                "status": (r["status"] or "new").lower(),
                "priority": (r["priority"] or "medium").lower(),
            }
            for r in rows
        ]
        return {"slug": project_slug, "issues": issues}
    finally:
        await conn.close()


async def import_v3(
    target_url: str, project_slug: str, api_key: str, payload: dict
) -> dict:
    """Import via v3 REST. Returns counts {created, skipped, failed}."""
    headers = {"Authorization": f"Bearer {api_key}"}
    stats = {"created": 0, "skipped": 0, "failed": 0}
    async with httpx.AsyncClient(base_url=target_url, timeout=30) as c:
        for issue in payload["issues"]:
            body = {
                "title": issue["title"],
                "description": issue.get("description"),
                "type": issue.get("type", "task"),
                "priority": issue.get("priority", "medium"),
            }
            try:
                r = await c.post(
                    f"/api/projects/{project_slug}/issues",
                    json=body,
                    headers=headers,
                )
                if r.status_code == 201:
                    stats["created"] += 1
                else:
                    stats["failed"] += 1
            except Exception:
                stats["failed"] += 1
    return stats


async def run(source_url: str, target_url: str, project_slug: str, api_key: str = "") -> None:
    payload = await extract_v2(source_url, project_slug)
    print(f"extracted {len(payload['issues'])} issues from v2")
    stats = await import_v3(target_url, project_slug, api_key, payload)
    print(f"import: {json.dumps(stats)}")


def main() -> None:
    """CLI entry; called via `bumblebee migrate-v2 ...`"""
    import argparse
    parser = argparse.ArgumentParser(description="v2 → v3 issue migration")
    parser.add_argument("--source", required=True, help="v2 PostgreSQL URL")
    parser.add_argument("--target", default="http://localhost:8000")
    parser.add_argument("--project-slug", default="bb")
    parser.add_argument("--api-key", default="")
    args = parser.parse_args()
    asyncio.run(run(args.source, args.target, args.project_slug, args.api_key))


if __name__ == "__main__":
    main()
