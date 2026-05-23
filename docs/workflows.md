# Bumblebee Workflows

A visual guide to how all the pieces work together.

---

## 1. System Overview

```
 You (Developer)
  |
  |--- bb CLI (terminal) ---------> FastAPI REST API ------> PostgreSQL
  |                                      |    |
  |--- Web Dashboard (browser) --->------+    |
  |                                      |    +---> WebSocket ---> Web Dashboard (live updates)
  |--- Claude Code (AI agent) ---> MCP Server (/mcp)
  |                                      |
  +--- Desktop App (Tauri) ------->------+
```

**Three ways to interact:**
- `bb` CLI in your terminal
- Web dashboard at `http://localhost:3000`
- Claude Code via MCP tools

All share the same data through the FastAPI backend.

---

## 2. Getting Started Workflow

```
Step 1: Start the API
  $ cd api && uvicorn src.main:app --reload
         |
Step 2: Register & Login
  $ bb register           (create account)
  $ bb login              (get JWT token, saved to ~/.bumblebee/config.toml)
         |
Step 3: Create a Project
  $ bb project create "My App" --slug my-app
         |
Step 4: Switch to it
  $ bb project switch my-app
         |
Step 5: Link your source code
  $ bb project link /path/to/my-app-source
         |
Step 6: Start working!
  $ bb story create "Add user login" -d "Implement OAuth login" -p high
```

**Config file** (`~/.bumblebee/config.toml`):
```toml
api_url = "http://localhost:8000"
token = "eyJ..."
current_project = "my-app"

[projects.my-app]
path = "/path/to/my-app-source"

[projects.another-project]
path = "/path/to/another-project"
```

---

## 3. Story Lifecycle

A story goes through these statuses:

```
  open
    |
    | (agent analyses or user confirms)
    v
  confirmed
    |
    | (user approves the plan)
    v
  approved
    |
    | (agent or dev starts working)
    v
  in_progress
    |
    | (work done, needs review)
    v
  in_review
    |
    +-------> resolved  (all tasks done)
    |             |
    |             v
    |           closed  (fully done)
    |
    +-------> failed    (something went wrong)
    +-------> needs_info (blocked, need more details)
```

**CLI commands for each stage:**
```bash
bb story create "Title" -d "description" -p high    # creates as 'open'
bb story update 1 -s confirmed                       # manual status change
bb story update 1 -s in_progress
bb story update 1 -s resolved
```

**Auto-resolution:** When ALL tasks on a story reach `done`, the story automatically becomes `resolved`.

---

## 4. Agent Loop (The Core Workflow)

This is the main automation feature. The agent analyses your code and implements changes autonomously.

```
                          bb agent run <story_id>
                                  |
                    +-------------+-------------+
                    |                           |
              Phase 1: SUGGEST            Phase 2: EXECUTE
                    |                           |
     +--------------+--------------+    +-------+--------+
     |              |              |    |                |
  Read story   Read source    Read       Create        Spawn
  from API     code files     knowledge  git worktree   Claude CLI
               (CLAUDE.md,    comments   (isolated      (bypassPermissions)
               knowledge.md)  from API   branch)
     |              |              |    |                |
     +--------------+--------------+    |     Implement changes
                    |                   |     Run tests
              Claude analyses           |     Commit code
              (read-only)               |                |
                    |                   +-------+--------+
              Posts plan as                     |
              AI comment                  Posts result as
                    |                     AI comment
              Story -> confirmed               |
                    |                     Story -> in_review
                    v                           |
              User reviews                Worktree kept
              the plan                    for merge/review
                    |
               Confirm?
              /        \
           Yes          No
            |            |
       Phase 2        (modify plan
       starts          or abort)
```

### 4a. Suggest Phase (Analysis Only)

```bash
$ bb agent suggest 42
```

What happens:
1. Fetches story #42 details from API
2. Reads project knowledge files:
   - `CLAUDE.md` (project instructions)
   - `docs/knowledge.md` (tech reference)
   - `.claude/lessons-learned.md` (patterns/fixes)
3. Reads all previous comments (for continuation)
4. Runs Claude CLI in read-only mode:
   ```
   claude -p "<analysis prompt>" --output-format text
   ```
5. Displays the analysis in terminal
6. Posts analysis as AI comment on the story
7. Story status: `open -> confirmed`

### 4b. Execute Phase (Implementation)

```bash
$ bb agent execute 42
```

What happens:
1. Fetches story + all comments (including the plan from suggest)
2. Creates git worktree:
   ```
   ~/.bumblebee/worktrees/my-app/story-42/
   Branch: bb/story-42
   ```
3. Creates AgentSession via API
4. Story status -> `in_progress`
5. Spawns Claude CLI in the worktree:
   ```
   claude --output-format stream-json \
          --verbose \
          --permission-mode bypassPermissions \
          --mcp-config - \
          -p "<implementation prompt>"
   ```
6. Streams output to terminal + relays to API (-> WebSocket -> Web UI)
7. Posts execution report as AI comment
8. Story status -> `in_review` (on success)

### 4c. Continue (Resume Incomplete Work)

```bash
$ bb agent continue 42
```

Same as execute, but explicitly for resuming. Reads ALL previous comments so Claude has full context of what was already done, what failed, and what remains.

### 4d. Full Loop

```bash
$ bb agent run 42           # suggest -> confirm -> execute
$ bb agent run 42 -y        # auto-confirm (no prompt)
$ bb agent run 42 --skip-suggest   # skip analysis, go straight to execute
```

### 4e. Worktree Management

```bash
$ bb agent worktrees                # list all active worktrees
$ bb agent cleanup 42               # remove worktree for story #42
$ bb agent cleanup 42 -D            # remove worktree + delete branch
```

After the agent completes, you can:
```bash
cd /your/project
git merge bb/story-42               # merge the agent's work
bb agent cleanup 42 -D              # clean up
```

---

## 5. Comment-Based Communication

Comments are the communication channel between humans and the AI agent.

```
Story #42: "Add dark mode"
  |
  +-- [User] "Need dark mode toggle in header, persist preference in localStorage"
  |
  +-- [bb-agent / AI] "## Analysis
  |    1. Add ThemeProvider context
  |    2. Modify Header component
  |    3. Add CSS variables for dark theme
  |    4. Store preference in localStorage
  |    Testing: Toggle switch, refresh persistence"
  |
  +-- [User] "Looks good, but also support system preference detection"
  |
  +-- [bb-agent / AI] "## Agent Execution Report
  |    Branch: bb/story-42
  |    Exit code: 0
  |    Changes: ThemeProvider, Header, globals.css
  |    Tests: All passing"
  |
  +-- [User] "Works great, merging!"
```

Each agent run reads ALL previous comments, so it always has full context.

---

## 6. Task Breakdown

Stories can be broken into tasks for granular tracking.

```
Story #42: "Add user authentication"
  |
  +-- Task: "Set up JWT middleware"          [done]
  +-- Task: "Create login page"             [done]
  +-- Task: "Create register page"          [in_progress]
  +-- Task: "Add password reset flow"       [todo]
  +-- Task: "Write auth integration tests"  [backlog]
```

Task statuses: `backlog -> todo -> in_progress -> in_review -> done`

```bash
bb task list 42                              # list tasks for story #42
bb task create 42 "Set up JWT middleware"     # create a task
bb task update <task-id> -s done             # mark as done
```

When ALL tasks reach `done`, the story auto-resolves.

---

## 7. Sprint Workflow

Organize stories into time-boxed sprints.

```
Sprint "Week 1"  [planning]
  |
  | bb sprint start <id>
  v
Sprint "Week 1"  [active]      <-- only one active sprint at a time
  |
  | Stories: #41, #42, #43
  | Progress tracked via story statuses
  |
  | bb sprint close <id>
  v
Sprint "Week 1"  [completed]
```

```bash
bb sprint list                    # list all sprints
bb sprint create "Week 1"        # create a sprint
bb sprint start <sprint-id>      # activate
bb sprint current                 # show active sprint
bb sprint close <sprint-id>      # complete
```

---

## 8. Real-Time Updates (WebSocket)

When anything changes, all connected clients get notified instantly.

```
  CLI: bb story update 42 -s resolved
         |
         v
    FastAPI API
         |
    +----+----+
    |         |
    DB     WebSocket broadcast
           "story:updated" { id: 42, status: "resolved" }
              |
         +----+----+
         |         |
    Web Dashboard  Desktop App
    (auto-refresh) (auto-refresh)
```

Events: `story:created`, `story:updated`, `story:deleted`, `task:updated`, `comment:created`, `agent:started`, `agent:output`, `agent:aborted`

---

## 9. MCP Integration (Claude Code as Client)

Claude Code can manage your project directly through MCP tools.

```
Claude Code (in any project)
  |
  | Uses MCP tools:
  |   bumblebee_stories   -> list/get/create/update stories
  |   bumblebee_tasks     -> list/get/create/update tasks
  |   bumblebee_comments  -> list/create comments
  |   bumblebee_sprints   -> list/get/create/update sprints
  |   bumblebee_agent_sessions -> manage agent sessions
  |
  v
FastAPI MCP Server (/mcp)
  |
  v
PostgreSQL (same data as CLI and Web)
```

To connect Claude Code, add to `.mcp.json`:
```json
{
  "mcpServers": {
    "bumblebee": {
      "url": "http://localhost:8000/mcp",
      "headers": {
        "Authorization": "Bearer <your-jwt-token>"
      }
    }
  }
}
```

---

## 10. Multi-Project Support

Bumblebee supports multiple projects. Each project is linked to its own source code directory.

```
~/.bumblebee/config.toml
  |
  +-- current_project: "bumblebee"
  |
  +-- projects:
       +-- bumblebee -> D:\Sources\bumblebee-cli
       +-- my-saas   -> D:\Sources\my-saas-app
       +-- client-x  -> D:\Sources\client-x-project
```

Switch between projects:
```bash
bb project switch bumblebee     # work on bumblebee
bb story list                   # shows bumblebee stories

bb project switch my-saas       # switch to my-saas
bb story list                   # shows my-saas stories

bb agent run 5                  # runs agent in my-saas source directory
```

Each project gets its own worktrees:
```
~/.bumblebee/worktrees/
  +-- bumblebee/
  |    +-- story-1/
  |    +-- story-3/
  +-- my-saas/
       +-- story-5/
```

---

## 11. Typical Day-to-Day Workflow

```
Morning:
  $ bb project switch my-app
  $ bb sprint current                    # check what's active
  $ bb board                             # kanban overview

Create work:
  $ bb story create "Fix login bug" -d "Users can't login with email containing +" -p high -t bug

Let the agent handle it:
  $ bb agent run 42                      # analyse -> confirm -> implement
  ... review the suggestion ...
  > Proceed with implementation? [y/n]: y
  ... agent works in worktree ...
  [green] Agent completed successfully.

Review & merge:
  $ cd /path/to/my-app
  $ git diff main..bb/story-42           # review changes
  $ git merge bb/story-42                # merge
  $ bb agent cleanup 42 -D              # clean up worktree + branch
  $ bb story update 42 -s closed        # close the story

Track progress:
  $ bb board                             # updated kanban
  $ bb agent status                      # check running sessions
```

---

## 12. Architecture Layers

```
+----------------------------------------------------------+
|                    User Interfaces                        |
|  +--------+  +-----------+  +---------+  +----------+    |
|  |  CLI   |  |    Web    |  | Desktop |  | Claude   |    |
|  | (bb)   |  | Dashboard |  |  (Tauri)|  | Code MCP |    |
|  +---+----+  +-----+-----+  +----+----+  +----+-----+    |
|      |             |              |             |          |
+------+-------------+--------------+-------------+---------+
       |             |              |             |
+------+-------------+--------------+-------------+---------+
|                    FastAPI Backend                         |
|  +------+  +--------+  +-----+  +--------+  +---------+  |
|  | Auth |  | Stories |  |Tasks|  | Sprints|  | Agent   |  |
|  | JWT  |  | CRUD   |  |CRUD |  | CRUD   |  | Sessions|  |
|  | +Key |  +--------+  +-----+  +--------+  +---------+  |
|  +------+  | Epics  |  |Labels|  |Comments|  | MCP     |  |
|            +--------+  +------+  +--------+  | Server  |  |
|                                               +---------+  |
|  +------------------+  +--------------------+              |
|  | WebSocket Manager|  | Lifecycle Hooks    |              |
|  | (broadcast)      |  | (auto-resolution) |              |
|  +------------------+  +--------------------+              |
+----------------------------------------------------------+
       |
+------+---------------------------------------------------+
|                    PostgreSQL                              |
|  Users, Projects, Epics, Sprints, Stories, Tasks,         |
|  Comments, Labels, AgentSessions, Notifications           |
+----------------------------------------------------------+
```
