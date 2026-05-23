# Forge Strapi Backend

Strapi 5 headless CMS with custom APIs, WebSocket, and multi-provider AI agent execution.

## Architecture

- `src/api/` — Content-type APIs (issue, task, project, chat, comment, usage-record)
- `src/services/agent/` — Agent runner with tools (forge_issues, forge_tasks, etc.)
- `src/services/websocket.ts` — WS broadcasts for real-time updates
- `src/services/ai-enrichment.ts` — AI analysis of new issues
- `src/index.ts` — Bootstrap: registers WS, API permissions, lifecycle hooks
- `config/server.ts` — Server config, cron jobs (CLI ingestion)

## Key Patterns

- Each API follows Strapi structure: `content-types/`, `controllers/`, `routes/`, `services/`
- Lifecycle hooks on issue/task for auto-enrichment and status cascading
- Agent supports 3 providers: Anthropic (default), OpenAI, Gemini
- Use Strapi v5 document service API (`strapi.documents(uid).findMany(...)`)

## Recipes

**Add new API endpoint:**
1. Create folder `src/api/<name>/` with content-types, controllers, routes, services
2. Register permissions in `src/bootstrap/api-permissions.ts`
3. Add WS broadcast if real-time updates needed

**Add agent tool:**
1. Add tool definition in `src/services/agent/tools.ts`
2. MCP tools are served from Strapi at `/mcp` — no separate package needed

## Commands

- `npm run develop` — Start dev server (port 1337)
- `npm run build` — Build for production
