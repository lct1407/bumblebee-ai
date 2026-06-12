# bumblebee-ai

Node.js CLI for the [Bumblebee AI](https://github.com/lct1407/bumblebee-ai) multi-agent task management platform.

```
npm install -g bumblebee-ai
```

Requires Node.js >= 20. No Python required.

---

## Quickstart

```bash
# 1. Login (stores token in ~/.bumblebee/cli.json)
bb login admin --server https://bb-api.hubapi.cc

# 2. Check current workspace
bb whoami

# 3. List issues in project "bb"
bb issue list -p bb

# 4. Pair this machine as a worker node
bb device pair --server https://bb-api.hubapi.cc

# 5. After confirming the pairing code in the web UI:
bb device save-token <token-from-web>

# 6. Start the worker daemon
bb daemon
```

---

## Commands

| Command | Description |
|---|---|
| `bb version` | Print CLI version |
| `bb login <username>` | Login and cache token |
| `bb whoami` | Print current workspace |
| `bb issue list [-p slug] [--status]` | List issues |
| `bb issue create <title> [-p] [-t] [--priority]` | Create issue |
| `bb device pair [--server] [--name] [--workspace]` | Request device pairing |
| `bb device save-token <token>` | Save node token after web confirmation |
| `bb daemon [--server] [--config] [--interval]` | Start worker daemon |
| `bb skills targets` | List install targets |
| `bb skills install [-t target] [-r repo]` | Install role prompts into a repo |

---

## Server URL resolution

All commands resolve the server URL in this priority order:

1. `--server <url>` flag
2. `BB_SERVER_URL` environment variable
3. `server_url` field in the relevant config file (`~/.bumblebee/cli.json` or `node.json`)
4. Default: `https://bb-api.hubapi.cc` (cloud)

> Note: the Python `pip` CLI defaults to `http://localhost:8000` (self-hosted). The npm CLI defaults to the hosted cloud. Pass `--server http://localhost:8000` to target a local instance.

---

## Skills install targets

`bb skills install` writes Bumblebee role prompts into a repo so any AI coding assistant can use them:

| Target | Writes to |
|---|---|
| `claude-code` (default) | `.claude/agents/bumblebee-<role>.md` + `.claude/skills/bumblebee/SKILL.md` |
| `cursor` | `.cursor/rules/bumblebee-<role>.mdc` |
| `codex` | `AGENTS.md` (idempotent block) |
| `generic` | `.bumblebee/agents/<role>.md` |

Prompts are bundled inside the npm package (`prompts/*.yaml`) and synced from `bumblebee/prompts/` in the monorepo. No network required for `skills install`.

---

## Config files

Both the Node.js and Python CLIs share the same config schema:

**`~/.bumblebee/cli.json`** — auth config
```json
{
  "server_url": "https://bb-api.hubapi.cc",
  "access_token": "...",
  "username": "admin",
  "workspace": { "name": "My Workspace", "slug": "my-ws", "plan": "free" }
}
```

**`~/.bumblebee/node.json`** — daemon / device config
```json
{
  "server_url": "https://bb-api.hubapi.cc",
  "node_id": "...",
  "node_token": "nt_...",
  "status": "active"
}
```

If you use both the pip and npm CLIs they will share the same config files.

---

## Daemon

`bb daemon` connects this machine as a worker node. It:

- Sends heartbeats every 30 s with detected capabilities (`claude-cli`, `git`, `docker`) and discovered repos
- Long-polls `/api/tasks/claim` for work
- Executes `shell` tasks (streams stdout as log events)
- Executes `role_exec` tasks (spawns `claude --print --output-format=json`, optionally runs `git apply` on diff output)

Repo discovery scans `BB_WORKER_REPOS` (colon-separated paths) or `~/code`, `~/src`, `~/Source` by default.

---

## License

MIT
