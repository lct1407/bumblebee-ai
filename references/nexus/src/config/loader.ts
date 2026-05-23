import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { configSchema, type NexusConfig } from "./schema.js";

export function getDataDir(): string {
  return process.env.NEXUS_DATA_DIR ?? join(process.cwd(), "data");
}

export async function loadConfig(): Promise<NexusConfig> {
  const configPath = join(getDataDir(), "config.json");

  let raw: Record<string, unknown> = {};
  try {
    const content = await readFile(configPath, "utf-8");
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // Missing or unreadable config file — use defaults
  }

  // --- Gateway env overrides ---
  if (process.env.NEXUS_GATEWAY_PORT) {
    const gateway = (raw.gateway ?? {}) as Record<string, unknown>;
    gateway.port = Number(process.env.NEXUS_GATEWAY_PORT);
    raw.gateway = gateway;
  }

  if (process.env.NEXUS_GATEWAY_TOKEN) {
    const gateway = (raw.gateway ?? {}) as Record<string, unknown>;
    gateway.token = process.env.NEXUS_GATEWAY_TOKEN;
    raw.gateway = gateway;
  }

  // --- Provider env overrides ---
  if (process.env.ANTHROPIC_API_KEY) {
    const providers = (raw.providers ?? {}) as Record<string, unknown>;
    const anthropic = (providers.anthropic ?? {}) as Record<string, unknown>;
    anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
    providers.anthropic = anthropic;
    raw.providers = providers;
  }

  if (process.env.OPENAI_API_KEY) {
    const providers = (raw.providers ?? {}) as Record<string, unknown>;
    const openai = (providers.openai ?? {}) as Record<string, unknown>;
    openai.apiKey = process.env.OPENAI_API_KEY;
    providers.openai = openai;
    raw.providers = providers;
  }

  if (process.env.GEMINI_API_KEY) {
    const providers = (raw.providers ?? {}) as Record<string, unknown>;
    const gemini = (providers.gemini ?? {}) as Record<string, unknown>;
    gemini.apiKey = process.env.GEMINI_API_KEY;
    providers.gemini = gemini;
    raw.providers = providers;
  }

  // --- Channel env overrides ---
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const channels = (raw.channels ?? {}) as Record<string, unknown>;
    const telegram = (channels.telegram ?? {}) as Record<string, unknown>;
    telegram.token = process.env.TELEGRAM_BOT_TOKEN;
    channels.telegram = telegram;
    raw.channels = channels;
  }

  // --- Strapi env overrides ---
  if (process.env.STRAPI_API_URL) {
    const strapi = (raw.strapi ?? {}) as Record<string, unknown>;
    strapi.baseUrl = process.env.STRAPI_API_URL;
    raw.strapi = strapi;
  }

  if (process.env.NEXUS_CORS_ORIGINS) {
    const strapi = (raw.strapi ?? {}) as Record<string, unknown>;
    strapi.corsOrigins = process.env.NEXUS_CORS_ORIGINS.split(",").map((s) => s.trim());
    raw.strapi = strapi;
  }

  return configSchema.parse(raw);
}
