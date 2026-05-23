"""Demo: seed issue relations + per-type field schemas + custom_fields values.

Demonstrates Jira/Linear-style linkage in Bumblebee:
  - BB-4 (Wire LLM provider) blocked_by BB-5 (Source-aware context)
    → cannot Implementer work without reading source first
  - BB-6 (Daemon Claude per role) depends_on BB-4
  - BB-12 (Issue UI buttons) relates_to BB-28 (Story container)

Also defines field schemas per issue type:
  - BUG: severity, repro_steps, affected_version
  - STORY: story_points, persona
  - EPIC: target_release, okr_link

Sets custom_fields on a few existing issues.
"""
from __future__ import annotations
import asyncio
import sys

from dotenv import load_dotenv
from sqlalchemy import select

load_dotenv()

from bumblebee.database import SessionLocal
from bumblebee.models.issue import Issue, IssueType
from bumblebee.models.issue_relation import IssueRelation, IssueRelationKind
from bumblebee.models.field_schema import FieldSchema
from bumblebee.models.project import Project


FIELD_SCHEMAS = {
    IssueType.BUG: {
        "fields": [
            {"key": "severity", "type": "enum",
             "options": ["low", "medium", "high", "critical"], "required": True},
            {"key": "repro_steps", "type": "text", "max_length": 2000},
            {"key": "affected_version", "type": "string", "pattern": r"^v?\d+\.\d+"},
            {"key": "browser", "type": "string"},
        ]
    },
    IssueType.STORY: {
        "fields": [
            {"key": "story_points", "type": "integer", "min": 1, "max": 13},
            {"key": "persona", "type": "enum",
             "options": ["solo-dev", "team-lead", "founder", "ops-eng"]},
            {"key": "acceptance_video_url", "type": "url"},
        ]
    },
    IssueType.EPIC: {
        "fields": [
            {"key": "target_release", "type": "string", "pattern": r"^v?\d+\.\d+"},
            {"key": "okr_link", "type": "url"},
            {"key": "stakeholder", "type": "string"},
        ]
    },
}

# (source_number, target_number, kind, note)
RELATIONS = [
    (4, 5, IssueRelationKind.DEPENDS_ON,
     "Implementer needs source-aware context (BB-5) before LLM provider wiring is useful"),
    (6, 4, IssueRelationKind.DEPENDS_ON,
     "Daemon per-role exec needs real LLM provider first"),
    (12, 4, IssueRelationKind.RELATES_TO,
     "UI buttons trigger workflows that depend on real LLM"),
    (15, 12, IssueRelationKind.RELATES_TO,
     "Project repo linking pairs with issue-lifecycle UI"),
]

# (issue_number, custom_fields dict)
CUSTOM_FIELDS = [
    (10, {"severity": "critical", "affected_version": "v0.4.0",
          "repro_steps": "1. Open .env\n2. See API_SECRET_KEY=change-me-in-production"}),
    (2, {"severity": "high", "affected_version": "v0.3.0",
         "repro_steps": "bcrypt rounds set to 12, recommend 13+"}),
    (7, {"severity": "high", "browser": "n/a", "affected_version": "v0.5.0"}),
]


async def main() -> int:
    async with SessionLocal() as db:
        proj = (
            await db.execute(select(Project).where(Project.slug == "bb"))
        ).scalar_one()

        # 1. Field schemas
        print("=== Field schemas ===")
        for typ, schema in FIELD_SCHEMAS.items():
            existing = (
                await db.execute(
                    select(FieldSchema).where(
                        FieldSchema.workspace_id == proj.workspace_id,
                        FieldSchema.project_id == proj.id,
                        FieldSchema.issue_type == typ,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                existing.schema = schema
                print(f"  [upd] {typ.value}: {len(schema['fields'])} fields")
            else:
                fs = FieldSchema(
                    workspace_id=proj.workspace_id, project_id=proj.id,
                    issue_type=typ, schema=schema,
                    description=f"Default {typ.value} field schema",
                )
                db.add(fs)
                print(f"  [ok]  {typ.value}: {len(schema['fields'])} fields")
        await db.commit()

        # 2. Relations
        print("\n=== Relations ===")
        for src_n, tgt_n, kind, note in RELATIONS:
            src = (
                await db.execute(
                    select(Issue).where(Issue.project_id == proj.id, Issue.number == src_n)
                )
            ).scalar_one_or_none()
            tgt = (
                await db.execute(
                    select(Issue).where(Issue.project_id == proj.id, Issue.number == tgt_n)
                )
            ).scalar_one_or_none()
            if not src or not tgt:
                print(f"  [skip] BB-{src_n} / BB-{tgt_n} missing")
                continue
            existing = (
                await db.execute(
                    select(IssueRelation).where(
                        IssueRelation.source_issue_id == src.id,
                        IssueRelation.target_issue_id == tgt.id,
                        IssueRelation.kind == kind,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                print(f"  [skip] BB-{src_n} {kind.value} BB-{tgt_n}")
                continue
            rel = IssueRelation(
                workspace_id=proj.workspace_id,
                source_issue_id=src.id, target_issue_id=tgt.id,
                kind=kind, note=note,
            )
            db.add(rel)
            print(f"  [ok]  BB-{src_n} {kind.value} BB-{tgt_n}")
        await db.commit()

        # 3. Custom fields on existing issues
        print("\n=== Custom fields ===")
        for num, fields in CUSTOM_FIELDS:
            issue = (
                await db.execute(
                    select(Issue).where(Issue.project_id == proj.id, Issue.number == num)
                )
            ).scalar_one_or_none()
            if not issue:
                print(f"  [skip] BB-{num} missing")
                continue
            issue.custom_fields = {**(issue.custom_fields or {}), **fields}
            print(f"  [ok]  BB-{num} <- {list(fields.keys())}")
        await db.commit()

    print("\nrelations + fields seeded.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
