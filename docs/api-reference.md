# API Reference

Base URL: `http://localhost:8000`

## Authentication

All endpoints (except login/register) require authentication via one of:
- `Authorization: Bearer <jwt_token>`
- `X-BB-API-Key: bb_<api_key>`

### POST /auth/register
Create a new account.
```json
{ "email": "user@example.com", "username": "user", "password": "secret" }
```

### POST /auth/login
Get a JWT access token.
```json
{ "email": "user@example.com", "password": "secret" }
```
Response: `{ "access_token": "...", "token_type": "bearer" }`

### GET /auth/me
Get current user info.

### POST /auth/api-keys
Create a new API key. Response includes the raw key (shown once).
```json
{ "name": "my-cli-key" }
```

### GET /auth/api-keys
List all API keys for current user.

### DELETE /auth/api-keys/{key_id}
Delete an API key.

---

## Projects

### GET /api/projects
List all projects owned by current user.

### POST /api/projects
```json
{ "name": "My Project", "slug": "my-project", "description": "...", "repo_url": "..." }
```

### GET /api/projects/{slug}
### PUT /api/projects/{slug}
### DELETE /api/projects/{slug}

---

## Stories

### GET /api/projects/{slug}/stories
Query params: `status`, `sprint_id`, `epic_id`

### POST /api/projects/{slug}/stories
```json
{
  "title": "Implement login",
  "description": "...",
  "story_type": "feature",
  "priority": "high",
  "assignee": "agent",
  "label_ids": []
}
```

### GET /api/stories/{id}
### PUT /api/stories/{id}
Supports partial updates. Status changes are tracked in `change_history`.
### DELETE /api/stories/{id}

---

## Tasks

### GET /api/stories/{story_id}/tasks
### POST /api/stories/{story_id}/tasks
```json
{ "title": "Create form component", "description": "..." }
```

### GET /api/tasks/{task_id}
### PUT /api/tasks/{task_id}
When all tasks on a story become `done`, the story auto-resolves.
### DELETE /api/tasks/{task_id}

---

## Comments

### GET /api/stories/{story_id}/comments
### POST /api/stories/{story_id}/comments
```json
{ "body": "This looks good!", "is_ai": false }
```

---

## Labels

### GET /api/projects/{slug}/labels
### POST /api/projects/{slug}/labels
```json
{ "name": "frontend", "color": "#3b82f6" }
```

---

## Epics

### GET /api/projects/{slug}/epics
### POST /api/projects/{slug}/epics
```json
{ "title": "User Auth", "description": "...", "color": "#8b5cf6" }
```
### PUT /api/projects/{slug}/epics/{epic_id}

---

## Sprints

### GET /api/projects/{slug}/sprints
### POST /api/projects/{slug}/sprints
```json
{ "name": "Sprint 1", "goal": "Ship auth flow" }
```
### PUT /api/projects/{slug}/sprints/{sprint_id}
### POST /api/projects/{slug}/sprints/{sprint_id}/start
Only one active sprint per project.
### POST /api/projects/{slug}/sprints/{sprint_id}/close

---

## Agent Sessions

### GET /api/agent-sessions?project_slug={slug}
List sessions for a project.

### POST /api/agent-sessions/start?project_slug={slug}
```json
{ "story_id": 1, "origin": "web" }
```

### GET /api/agent-sessions/{session_id}
### POST /api/agent-sessions/{session_id}/send
```json
{ "message": "Focus on the login component" }
```

### POST /api/agent-sessions/{session_id}/relay
Relay Claude CLI stream-json output to WebSocket subscribers.

### POST /api/agent-sessions/{session_id}/abort

---

## WebSocket

### /ws?project={slug}

Events broadcast:
- `story:created`, `story:updated`, `story:deleted`
- `task:created`, `task:updated`, `task:deleted`
- `comment:created`
- `agent:started`, `agent:message`, `agent:output`, `agent:aborted`

---

## MCP Server

### POST /mcp | GET /mcp

Streamable HTTP MCP endpoint. Tools:
- `bumblebee_stories(action, project_slug?, story_id?, data?)`
- `bumblebee_tasks(action, story_id?, task_id?, data?)`
- `bumblebee_comments(action, story_id?, data?)`
- `bumblebee_sprints(action, project_slug?, sprint_id?, data?)`
- `bumblebee_agent_sessions(action, project_slug?, session_id?, data?)`
- `TodoWrite(todos)` — Progress checklist

Actions: `list`, `get`, `create`, `update` (varies by tool)

---

## Health Check

### GET /health
Returns `{ "status": "ok" }`
