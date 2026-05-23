# Nexus

Multi-channel AI agent server with Telegram integration, Express gateway, and memory system.

## Architecture

- `src/agent/` — AI provider abstraction (Anthropic, OpenAI, Gemini), tool system, runner
- `src/gateway/` — Express server, WebSocket protocol, auth, broadcasting
- `src/channel/` — Channel abstraction (registry, types, message chunking)
- `src/channels/telegram/` — Telegram bot via grammY framework
- `src/session/` — Session store, conversation transcripts
- `src/memory/` — Knowledge extraction, memory service, memory tools
- `src/queue/` — Message debouncing and reply pipeline
- `src/config/` — Config loading with Zod schemas
- `src/web/` — Web dashboard (HTML + JS)

## Key Patterns

- Provider pattern: agent/provider.ts abstracts AI backends (Anthropic default)
- Tool system: agent/tools.ts defines callable tools, hrm-tools.ts for HR domain
- grammY for Telegram: bot.ts handles messages, plugin.ts extends functionality
- better-sqlite3 for local persistence
- ESM module with tsup bundling (Node22 target)

## Recipes

**Add AI tool:** 1. Define in src/agent/tools.ts. 2. Implement handler. 3. Register in runner.

**Add channel:** 1. Create src/channels/<name>/. 2. Implement channel interface from src/channel/types.ts. 3. Register in src/channel/registry.ts.

## Commands

- `npm run dev` — Watch mode with auto-reload
- `npm run build` — Build with tsup
- `npm run start` — Run compiled dist
- `npm run test` — Run vitest
