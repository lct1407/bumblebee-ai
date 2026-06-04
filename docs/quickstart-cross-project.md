# Quick start — use Bumblebee from another project

Install the `bb` CLI in any project, point it at your Bumblebee server, and let Claude Code / Codex read issues + drive the plan → code → test → merge loop.

## 1. Install

```bash
pip install bumblebee-ai
bb --version
# Bumblebee 0.5.0
```

The same binary is also published as `bumblebee` for typing it out.

## 2. Connect to your Bumblebee server

```bash
bb login --api https://bb-api.hubapi.cc
# opens browser → log in → token stored at ~/.bumblebee/credentials.json

bb whoami
# user: ai010@grytt.co · workspace: default · plan: pro
```

## 3. Point Claude Code / Codex / Cursor at the MCP

`~/.config/claude/claude_desktop_config.json` (Claude Code / Desktop):
```json
{
  "mcpServers": {
    "bumblebee": {
      "url": "https://bb.hubapi.cc/mcp",
      "headers": { "Authorization": "Bearer bb_live_..." }
    }
  }
}
```
Get the API key: `bb keys create cross-project-laptop`.

Cursor + Codex use the same JSON shape under their own MCP settings panel.

## 4. Bind this project to a Bumblebee project

From inside the target repo:
```bash
cd /path/to/other-project
bb project init           # interactive: pick or create a Bumblebee project, scope branch
bb project bind <name>    # one-liner alternative
```
Writes `.bumblebee.toml` at the repo root — Claude/Codex use it to know which project an issue lives in.

## 5. The dev loop, end-to-end

Open Claude Code in the project. Say:

> "List open issues in this project and pick the smallest TASK. Read the description + events, build a 3-step plan, implement, test, open a PR."

Claude (or Codex) calls these MCP tools in order:

| Step | MCP tool | What |
|---|---|---|
| 1. discover | `bumblebee_issues(action="list", filter={"status":"PLANNED"})` | get the backlog |
| 2. read | `bumblebee_issues(action="get", id=…)` + `bumblebee_events(action="list", issue_id=…)` | full context |
| 3. branch | (local git) | `git checkout -b feat/<slug>` |
| 4. implement | (local edits) | apply diff |
| 5. test | (local pytest / npm test) | green CI prerequisite |
| 6. append progress | `bumblebee_events(action="append", issue_id=…, kind="progress", payload={…})` | live timeline for the web UI |
| 7. transition | `bumblebee_issues(action="update", id=…, data='{"status":"IN_REVIEW"}')` | gate to review |
| 8. open PR | `gh pr create` | reviewer handoff |

The `events` you append stream to the web at `https://bb.hubapi.cc/issues/<num>` in real time via WebSocket — your reviewers see exactly what the agent did, when, and why.

## 6. Useful CLI commands

```bash
# Issues
bb issue list --status PLANNED
bb issue get BB-42
bb issue create --type FEATURE --title "Add ..."

# Devices (for distributed code execution)
bb device pair                # one-time, pair this laptop as an execution node
bb daemon start               # claim queued tasks for projects this node binds

# MCP smoke
bb mcp test --url https://bb.hubapi.cc/mcp

# Skills bundle (install Claude Code / Cursor / Codex skills tuned for Bumblebee)
bb skills install --target claude-code
bb skills install --target cursor
bb skills install --target codex
```

## 7. Where things live

| Concern | Location |
|---|---|
| Issues, projects, events | `https://bb.hubapi.cc` (web) or `bb issue ...` |
| MCP for IDE agents | `https://bb.hubapi.cc/mcp` |
| Audit/run history | web at `/issues/<num>` (live) |
| Local CLI credentials | `~/.bumblebee/credentials.json` |
| Per-repo binding | `<repo>/.bumblebee.toml` |

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `bb` not found | `pip install bumblebee-ai` and ensure your venv `bin/` is on PATH |
| 401 from MCP | regenerate key: `bb keys create new-key` |
| MCP returns empty tool list | check `curl https://bb.hubapi.cc/mcp/tools` (no auth needed) — if empty, server didn't pick up your workspace; run `bb whoami` |
| Issue update 403 | role lacks transition perm; ask workspace owner to grant `DEVELOPER` or higher |
| No live event stream in web | WebSocket blocked by your network; events still persist, just no live tail |
