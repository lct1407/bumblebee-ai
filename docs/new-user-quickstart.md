# Bumblebee New User Quickstart

A step-by-step guide to set up Bumblebee for a new project and run your first fully automated AI coding pipeline.

**Time required**: ~20 minutes

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install the CLI](#2-install-the-cli)
3. [Create an Account and Log In](#3-create-an-account-and-log-in)
4. [Create a Project](#4-create-a-project)
5. [Initialize Your Repository](#5-initialize-your-repository)
6. [Create Work Items](#6-create-work-items)
7. [Register Your Device and Start the Daemon](#7-register-your-device-and-start-the-daemon)
8. [Run the Agent from the CLI](#8-run-the-agent-from-the-cli)
9. [Trigger from the Web UI](#9-trigger-from-the-web-ui)
10. [Verify Everything Worked](#10-verify-everything-worked)
11. [Full Pipeline Test](#11-full-pipeline-test)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Before starting, make sure you have the following installed:

| Tool | Version | Verify with |
|------|---------|-------------|
| Python | 3.12+ | `python --version` |
| Git | 2.30+ | `git --version` |
| Claude CLI | Latest | `claude --version` |

**Claude CLI** is required for the AI agent to work. Install it from [https://docs.anthropic.com/en/docs/claude-code/overview](https://docs.anthropic.com/en/docs/claude-code/overview).

You also need **a git repository** — the project you want Bumblebee to automate. If you do not have one, create a simple test project:

```bash
mkdir my-test-project && cd my-test-project
git init
echo "# My Test Project" > README.md
git add . && git commit -m "initial commit"
```

### Server Access

You need access to a running Bumblebee server. Two options:

| Setup | API URL | Web URL |
|-------|---------|---------|
| **Hosted** (recommended) | `https://api-bumble.hubapi.cc` | `https://bumble.hubapi.cc` |
| **Docker (local)** | `http://localhost:8456` | `http://localhost:3456` |

The rest of this guide uses the hosted server. If you are running locally via Docker, replace `https://api-bumble.hubapi.cc` with `http://localhost:8456` everywhere.

---

## 2. Install the CLI

### Option A: npm (recommended)

```bash
npm install -g bumblebee-cli
```

### Option B: pip (PyPI)

```bash
pip install bumblebee-cli
```

### Option C: From source (development)

```bash
git clone https://github.com/sidcorp-io/bumblebee-cli.git
cd bumblebee-cli/cli
pip install -e .
```

### Verify installation

```bash
bb --help
```

**Expected output:**

```
Usage: bb [OPTIONS] COMMAND [ARGS]...

  Bumblebee - Dev Task Management + Claude Code Automation

Options:
  --help  Show this message and exit.

Commands:
  agent    Agent workflow commands
  auth     Login, register, logout
  board    Kanban board view
  comment  Comment management
  daemon   Agent daemon for web-initiated sessions
  device   Manage registered devices
  init     Initialize project-local config
  item     Work item management
  ...
```

If you see the help output above, the CLI is installed correctly.

---

## 3. Create an Account and Log In

### 3a. Register (first time only)

You can register via the web UI or the CLI.

**Via CLI:**

```bash
bb auth register
```

You will be prompted for:

```
Email: you@example.com
Username: yourname
Password: ********
Password (repeat): ********
```

**Expected output:**

```
Registered! You can now run bb login.
```

**Via Web UI:** Go to `https://bumble.hubapi.cc/register` (or `http://localhost:3456/register`) and fill in the form.

### 3b. Log in

```bash
bb login
```

You will be prompted for:

```
Email: you@example.com
Password: ********
```

**Expected output:**

```
Logged in successfully.
```

### 3c. Verify authentication

```bash
bb auth whoami
```

**Expected output:**

```
yourname (you@example.com)
```

### 3d. Check configuration

```bash
bb auth config
```

**Expected output:**

```
Config source: global (~/.bumblebee/)
API URL: https://api-bumble.hubapi.cc
Logged in: Yes
Current project: None
```

### 3e. Change API URL (only if using a different server)

If you are connecting to a different server (e.g., Docker at localhost:8456), set the API URL before logging in:

**Option 1 — Environment variable (temporary):**

```bash
export BB_API_URL=http://localhost:8456
bb login
```

**Option 2 — Edit config file directly:**

Edit `~/.bumblebee/config.toml`:

```toml
api_url = "http://localhost:8456"
```

Then run `bb login`.

---

## 4. Create a Project

You can create a project via the CLI or the web UI.

### Via CLI

```bash
bb project create "My Test Project" --slug my-test-project
```

**Expected output:**

```
Created project my-test-project
```

### Via Web UI

1. Go to `https://bumble.hubapi.cc` (or `http://localhost:3456`)
2. Log in with your credentials
3. Click "Projects" in the sidebar
4. Click "New Project"
5. Fill in:
   - **Name**: My Test Project
   - **Slug**: my-test-project (auto-generated from name)
   - **Key**: MTP (short prefix for work item numbers, e.g., MTP-1, MTP-2)
6. Click "Create"

### Verify

```bash
bb project list
```

**Expected output:**

```
             Projects
┏━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━┓
┃ Slug              ┃ Name              ┃ Local Path ┃ Repo ┃
┡━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━┩
│ my-test-project   │ My Test Project   │ -          │ -    │
└───────────────────┴───────────────────┴────────────┴──────┘
```

---

## 5. Initialize Your Repository

Navigate to **your project's git repository** (not the bumblebee-cli repo) and run `bb init`:

```bash
cd /path/to/my-test-project
bb init
```

This does three things:

1. **Selects or creates a project** — you will see an interactive picker:

```
          Select a project
┏━━━┳━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┓
┃ # ┃ Slug              ┃ Name                 ┃
┡━━━╇━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━┩
│ 1 │ my-test-project   │ My Test Project      │
│ 2 │ + new             │ Create a new project │
└───┴───────────────────┴──────────────────────┘
Pick a project: 1
```

Pick your project (or create a new one from this prompt).

2. **Prompts for workflow pack** — choose a workflow pack:

```
Choose workflow pack:
  1. Standard  — bb-issue orchestrator + bb-agent + root-cause tracing
  2. Minimal   — bb-agent only (manual workflow)
  3. Skip      — no skills or agents
Choose [1]:
```

For first-time setup, choose **1 (Standard)**.

3. **Prompts for IDE integration** — install AI skills for your editor:

```
Install AI agent skills for your IDE?
  1. Claude Code (.claude/skills/ + .claude/agents/)
  2. Cursor (.cursor/rules/)
  3. Antigravity (.antigravity/rules/)
  4. All of the above
  5. Skip
Choose [4]:
```

Choose **1** if you only use Claude Code, or **4** for all.

**Expected output:**

```
Initialized .bumblebee/ at /path/to/my-test-project
  current_project = My Test Project (my-test-project)
  linked path = /path/to/my-test-project
Done!
```

### Verify

```bash
bb auth config
```

**Expected output now shows your project:**

```
Config source: local (.bumblebee/)
API URL: https://api-bumble.hubapi.cc
Logged in: Yes
Current project: my-test-project
Source path: /path/to/my-test-project
```

Check that `.bumblebee/config.toml` was created:

```bash
cat .bumblebee/config.toml
```

```toml
current_project = "my-test-project"
```

### Alternative: Manual setup (no interactive prompts)

If you want to skip the prompts:

```bash
bb init --project my-test-project --pack skip --ides none
```

### Upgrading an Existing Project

If you already have BB set up and want to update to the latest version:

**Step 1 — Update the CLI:**

```bash
# npm users
bb update              # built-in self-updater
# or manually:
npm install -g bumblebee-cli@latest

# pip users
pip install --upgrade bumblebee-cli

# From source users
cd /path/to/bumblebee-cli && git pull && cd cli && pip install -e .
```

**Step 2 — Update your project's skills/agents:**

```bash
cd /path/to/my-project
bb upgrade             # interactive: pick pack + IDEs
# or non-interactive:
bb upgrade --pack standard --ides all
```

This re-installs workflow packs and IDE skills without touching your config. Your `.bumblebee/config.toml`, work items, and project settings are preserved.

**What gets updated:**

| Preserved | Updated |
|-----------|---------|
| `.bumblebee/config.toml` | `.claude/skills/` |
| Work items, comments, sprints | `.claude/agents/` |
| Project settings | `.cursor/rules/` |
| Device registration | DB schema (auto-migrate) |

---

## 6. Create Work Items

Now create some work items that the AI agent can implement. These should be simple, self-contained tasks.

### AI-enriched creation (recommended)

Just provide a title and let AI suggest the type, priority, and description:

```bash
bb item create "Add a hello world endpoint at /hello"
```

You will be prompted:

```
Describe your idea further (Enter to use title):
> A simple GET /hello endpoint that returns {"message": "Hello, World!"}

AI analyzing...
AI suggests:
  Type:     task
  Priority: medium
  Title:    Add a hello world GET endpoint at /hello
  Description:
    Create a simple GET endpoint at /hello that returns a JSON response...

Create task? (Y/n): Y
Created task MTP-1: Add a hello world GET endpoint at /hello
```

### Direct creation (skip AI)

For quick creation without AI enrichment:

```bash
bb item create "Add .gitignore with Python defaults" --type task --priority low

bb item create "Create a README with project setup instructions" --type task --priority low

bb item create "Add a /health endpoint that returns service status" --type task --priority medium
```

### Suggested starter tasks

Here are good first tasks that Claude can complete quickly (1-2 minutes each):

| Task | Why it is good for testing |
|------|--------------------------|
| "Add .gitignore with Python defaults" | File creation only, no dependencies |
| "Create a README with project description and setup instructions" | Simple markdown generation |
| "Add a hello world endpoint at /hello" | Small code change, easy to verify |
| "Add a /health endpoint that returns status and timestamp" | Slightly more complex, still self-contained |
| "Fix typo in README: change 'Prject' to 'Project'" | Minimal change, tests the full pipeline |

### Verify items were created

```bash
bb item list
```

**Expected output:**

```
                    Work Items (my-test-project)
┏━━━━━━━┳━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━━┓
┃ Key   ┃ Type ┃ Title                                  ┃ Status  ┃ Priority ┃
┡━━━━━━━╇━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━━┩
│ MTP-1 │ task │ Add a hello world GET endpoint at /hello│ backlog │ medium   │
│ MTP-2 │ task │ Add .gitignore with Python defaults     │ backlog │ low      │
│ MTP-3 │ task │ Create a README with project setup...   │ backlog │ low      │
│ MTP-4 │ task │ Add a /health endpoint that returns...  │ backlog │ medium   │
└───────┴──────┴────────────────────────────────────────┴─────────┴──────────┘
```

View the kanban board:

```bash
bb board
```

Show details for a specific item:

```bash
bb item show MTP-1
```

---

## 7. Register Your Device and Start the Daemon

The daemon is a long-running process that listens for agent tasks triggered from the web UI. It registers your machine as an available "device" that can execute AI work.

### 7a. Check capabilities

First, verify that your machine has the required AI providers installed:

```bash
bb device capabilities
```

**Expected output:**

```
Current Environment Capabilities

  Hostname:   your-hostname
  OS:         Windows 11
  Arch:       AMD64
  CPU count:  16
  Shell:      bash
  Env type:   native

Providers
  claude-cli      available
  gemini-cli      not found
  proxy           available
```

You need **at least `claude-cli` showing as `available`**. If it shows `not found`, install the Claude CLI first (see Prerequisites).

### 7b. Start the daemon

```bash
bb daemon start
```

**Expected output:**

```
Device registered: id=7
Bumblebee Agent Daemon
  Project:    my-test-project
  Path:       /path/to/my-test-project
  API:        https://api-bumble.hubapi.cc
  Device UID: a3b4c5d6...
  Env:        native / bash
  Device ID:  7
  Workers:    2
  Poll:       every 5s

Listening for agent requests... (Ctrl+C to stop)
```

The daemon is now:
- Registered as a device on the server
- Polling the server every 5 seconds for new tasks
- Ready to execute up to 2 concurrent AI sessions

### 7c. Verify device registration

Open a **new terminal** (the daemon is running in the first one) and run:

```bash
bb device list
```

**Expected output:**

```
                     Registered Devices
┏━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━┓
┃ ID ┃ Name                     ┃ Status  ┃ OS      ┃ Env           ┃ Providers  ┃ Load ┃
┡━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━┩
│ 7  │ your-hostname-native     │ online  │ Windows │ native        │ claude-cli │ 0/2  │
└────┴──────────────────────────┴─────────┴─────────┴───────────────┴────────────┴──────┘
```

Status should be **online**. The device is also visible on the web UI under your project settings.

### Daemon options

```bash
# More concurrent workers (if your machine can handle it)
bb daemon start --max-concurrent 4

# Faster polling (more responsive, but more API calls)
bb daemon start --poll 3

# Label your machine in a group
bb daemon start --group "office-desktop"
```

### Managing the daemon

```bash
# Check if daemon is running
bb daemon status

# Stop the daemon gracefully (finishes active sessions)
bb daemon stop

# View recent daemon logs
bb daemon logs --tail 100
```

---

## 8. Run the Agent from the CLI

Before triggering from the web UI, test the agent pipeline directly from the CLI to make sure everything works.

### 8a. Suggest phase (analysis)

Pick a simple task and run the suggest phase:

```bash
bb agent suggest MTP-2
```

**What happens:**
1. Claude reads the work item details and your codebase
2. Analyzes what needs to be done
3. Posts a proposal comment on the work item
4. Updates status from `backlog` to `confirmed` (or `open` to `confirmed`)

**Expected output:**

```
Suggesting for MTP-2: Add .gitignore with Python defaults...
Claude analyzing codebase...
Posted proposal comment.
Status: backlog -> confirmed
```

### 8b. Review the proposal

```bash
bb comment list MTP-2
```

**Expected output:**

```
[proposal] bb-agent — 2 minutes ago
## Proposal

### Analysis
The project needs a .gitignore file with standard Python exclusions.

### Plan
1. Create `.gitignore` at the project root
2. Include standard Python patterns (__pycache__, .venv, *.pyc, etc.)
3. Add IDE-specific patterns (.vscode, .idea)

### Files to create
- `.gitignore` (new file)

### Estimated complexity: Low
```

### 8c. Full auto run (suggest + execute + test + merge)

For the next task, run the full pipeline in one command:

```bash
bb agent run MTP-1 -y --auto-merge --target release/dev
```

The `-y` flag auto-confirms the proposal (skips the review step). `--auto-merge` merges the branch into release/dev if tests pass.

**What happens (in order):**

```
1. Suggest phase
   - Claude analyzes the task
   - Posts proposal comment
   - Status: backlog -> confirmed

2. Execute phase
   - Creates git worktree at ~/.bumblebee/worktrees/my-test-project/item-1
   - Creates branch bb/item-1
   - Claude implements the code
   - Posts execution report comment
   - Status: confirmed -> in_progress -> in_review

3. Test phase
   - Runs tests in Docker sandbox
   - Posts test results comment
   - Status: in_review -> resolved (pass) or failed (fail)

4. Merge phase (if tests pass)
   - Merges bb/item-1 into release/dev
   - Cleans up worktree
```

**Expected terminal output:**

```
Suggesting for MTP-1...
  Posted proposal.
  Auto-confirming...

Executing MTP-1...
  Created worktree: ~/.bumblebee/worktrees/my-test-project/item-1
  Branch: bb/item-1
  Claude implementing...
  ████████████████████████ 100%
  Posted execution report.

Testing MTP-1...
  Running tests in Docker...
  Tests passed.

Merging bb/item-1 -> release/dev...
  Merge successful.
  Cleaned up worktree.

MTP-1: ok (tokens: 12,450in/3,200out)
```

---

## 9. Trigger from the Web UI

Now test the full loop where you trigger the agent from the web dashboard and it runs on your local machine via the daemon.

**Make sure your daemon is running** in a terminal (`bb daemon start`).

### 9a. Open the web dashboard

Go to `https://bumble.hubapi.cc` (or `http://localhost:3456`) and log in.

### 9b. Navigate to your project

1. Click "Projects" in the sidebar
2. Click "My Test Project"
3. Click "Items" to see your work items

**What you should see:** A list/board view with your items (MTP-1, MTP-2, etc.) and their statuses.

### 9c. Start an agent run

1. Click on a work item that is still in `backlog` or `open` status (e.g., MTP-3)
2. In the item detail panel, look for the "Agent" section or "Run Agent" button
3. Select the phase:
   - **"Suggest"** — runs analysis only
   - **"Run"** — runs the full pipeline (suggest + execute + test + merge)
4. Click "Run"

**What you should see on the web UI:**
- The item status changes to show the agent is working
- A live streaming output panel shows Claude's progress in real-time
- Comments appear on the item as each phase completes

**What you should see in the daemon terminal:**

```
Dequeued session 42 (queue #15)
  Running run for MTP-3...
  [cyan]Suggesting for MTP-3...[/cyan]
  ...
  [green]MTP-3: ok (tokens: 15,200in/4,100out)[/green]
```

### 9d. Watch the progress

On the web UI, the item detail page shows:
- **Status badge** updating in real-time (backlog -> confirmed -> in_progress -> in_review -> resolved)
- **Activity feed** with timestamped events for each status change
- **Comments** posted by the agent (proposal, execution report, test results)
- **Live output stream** while the agent is executing

---

## 10. Verify Everything Worked

After the agent completes, verify the results:

### 10a. Check work item status

```bash
bb item show MTP-1
```

**Expected:** Status should be `resolved` or `done`.

### 10b. Check comments posted

```bash
bb comment list MTP-1
```

**Expected:** You should see 2-3 comments:
- A **proposal** comment (from suggest phase)
- An **agent_output** comment (from execute phase)
- Possibly a **test report** comment (from test phase)

### 10c. Check git branches

```bash
git branch -a
```

**Expected:** You should see the agent branch:

```
* main
  release/dev
  remotes/origin/bb/item-1
```

### 10d. Check code changes

```bash
git log release/dev --oneline -5
```

**Expected:** You should see the agent's commit:

```
abc1234 feat: add hello world GET endpoint at /hello (MTP-1)
def5678 initial commit
```

### 10e. Check the actual code

```bash
git diff main..release/dev
```

Review the changes the agent made. They should match the task description.

### 10f. Check on the web UI

Go to the item detail page on the web dashboard:
- Status badge shows "Resolved" (green)
- Activity timeline shows all transitions
- Comments section has the full audit trail
- The linked branch name is shown

---

## 11. Full Pipeline Test

Run a more complex test to exercise the full pipeline including failure recovery.

### Create a task that requires multiple files

```bash
bb item create "Add a simple calculator module with add, subtract, multiply, divide functions and unit tests" --type task --priority medium
```

### Run the full pipeline

```bash
bb agent run MTP-5 -y --auto-merge --target release/dev --max-retries 3
```

This will:
1. **Suggest** — Claude analyzes the task and plans the implementation
2. **Execute** — Claude creates the calculator module and test files
3. **Test** — Runs the tests in a Docker sandbox
4. **Retry** — If tests fail, Claude reimplements (up to 3 attempts)
5. **Merge** — Merges to release/dev on success

### Monitor progress

While the agent runs, watch the daemon terminal output and the web UI item page.

On the web UI, the item activity feed will show something like:

```
12:00  Status changed: backlog -> confirmed
12:00  Comment added: [proposal] Analysis and implementation plan
12:01  Status changed: confirmed -> in_progress
12:02  Status changed: in_progress -> in_review
12:02  Comment added: [agent_output] Implementation summary
12:03  Comment added: [test] Test results - all passed
12:03  Status changed: in_review -> resolved
12:03  Branch bb/item-5 merged to release/dev
```

### Batch execution

To run multiple tasks in parallel:

```bash
# Suggest all open items at once
bb agent batch-suggest --all

# Run multiple items in parallel
bb agent batch-run MTP-3 MTP-4 --auto-merge
```

---

## 12. Troubleshooting

### "Not authenticated. Run 'bb login' first."

Your token may have expired. Run:

```bash
bb login
```

### "No project configured. Run 'bb init' or 'bb project use <slug>' first."

You are not in a directory with `.bumblebee/config.toml`, or no project is set. Either:

```bash
# Navigate to your project directory
cd /path/to/my-test-project

# Or set the project globally
bb project switch my-test-project
```

### "Cannot connect to the API server."

Check that you can reach the server:

```bash
curl https://api-bumble.hubapi.cc/health
```

If using Docker locally:

```bash
curl http://localhost:8456/health
```

If the server is down, check with the team or start the Docker setup.

### Daemon says "Device registration failed"

- Make sure you are logged in (`bb auth whoami`)
- Check your API URL (`bb auth config`)
- Check network connectivity to the server

### Agent says "claude: command not found"

The Claude CLI is not installed or not in your PATH. Install it from:
[https://docs.anthropic.com/en/docs/claude-code/overview](https://docs.anthropic.com/en/docs/claude-code/overview)

Verify with:

```bash
claude --version
```

### Device capabilities shows "claude-cli: not found"

Same as above — install the Claude CLI and make sure it is in your PATH.

```bash
which claude    # Linux/macOS
where claude    # Windows
```

### Agent hangs or takes too long

The agent has a 30-minute timeout and 5-minute stall detection. If it seems stuck:

1. Check the daemon terminal for error messages
2. Try a simpler task first to verify the pipeline works
3. Check `bb daemon logs` for detailed error information

### "Cannot transition from X to Y"

Status transitions are enforced. You may be missing a required step:

| Error | Fix |
|-------|-----|
| Cannot go from `backlog` to `in_progress` | Run `bb agent suggest` first (needs a proposal comment) |
| Cannot go from `confirmed` to `in_review` | Run `bb agent execute` first (needs an agent_output comment) |

Check current comments: `bb comment list MTP-X`

### Worktree conflicts

If a previous run left a dirty worktree:

```bash
# List active worktrees
bb agent worktrees

# Clean up a specific item's worktree
bb agent cleanup 1
```

### Windows-specific: UnicodeEncodeError

The CLI handles this automatically, but if you see encoding errors, set your terminal to UTF-8:

```powershell
# PowerShell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001
```

---

## Quick Reference Card

```bash
# Authentication
bb login                              # Log in
bb auth whoami                        # Check current user
bb auth config                        # Show configuration

# Project setup
bb project create "Name" --slug name  # Create project
bb project list                       # List all projects
bb project switch name                # Switch active project
bb init                               # Initialize .bumblebee/ in current dir

# Work items
bb item create "title"                # Create (AI-enriched)
bb item create "title" --type task    # Create (skip AI)
bb item list                          # List all items
bb item show MTP-1                    # Show item details
bb board                              # Kanban board view

# Comments
bb comment list MTP-1                 # List comments on item
bb comment add MTP-1 "message"        # Add a comment

# Agent (manual phases)
bb agent suggest MTP-1                # Analyze and propose
bb agent execute MTP-1                # Implement code
bb agent test MTP-1                   # Run tests
bb agent merge --target release/dev   # Merge branch

# Agent (full auto)
bb agent run MTP-1 -y --auto-merge    # Full pipeline
bb agent batch-run MTP-1 MTP-2        # Multiple items

# Daemon
bb device capabilities                # Check providers
bb daemon start                       # Start daemon
bb daemon status                      # Check if running
bb daemon stop                        # Stop daemon
bb device list                        # List registered devices

# Worktree management
bb agent worktrees                    # List active worktrees
bb agent cleanup 1                    # Remove worktree for item #1
```
