---
name: forge-skill
description: Sync local Claude Code skills with Strapi backend via script. Use when checking skill versions, comparing local vs remote skills, or pushing updated skills to Strapi. Triggers on "sync skills", "push skills", "check skill versions".
version: 1.1.0
---

# Forge Skill Sync

Sync local `.claude/skills/` to Strapi backend using a Python script (no MCP calls needed).

## Usage

```bash
# Dry run — show what would change
python3 .claude/skills/forge-skill/scripts/sync.py --dry-run

# Sync all skills
python3 .claude/skills/forge-skill/scripts/sync.py

# Sync a specific skill only
python3 .claude/skills/forge-skill/scripts/sync.py --skill nextjs

# Force push all (even unchanged)
python3 .claude/skills/forge-skill/scripts/sync.py --push-all
```

## How It Works

1. Reads all local skill dirs under `.claude/skills/*/SKILL.md`
2. Fetches remote skills from Strapi REST API (`GET /api/skills`)
3. Compares content hashes (skillMd + files)
4. Pushes changed/new skills via `POST/PUT /api/skills`
5. Reports summary: created, updated, unchanged

## Environment

- `STRAPI_TOKEN` — Override API token (default: built-in)
- `STRAPI_URL` — Override base URL (default: https://forge-api.sidcorp.co)

## Rules

- Skips syncing `forge-skill` itself
- Skips `__pycache__`, `.pyc`, `Zone.Identifier`, `.DS_Store`
- Binary files (images, fonts, archives): base64 encoded
- All synced skills are marked `isGlobal: true`
