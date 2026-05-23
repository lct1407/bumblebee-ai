import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("system-prompt");

export interface SystemPromptParams {
  customPrompt?: string;
  channel?: string;
  sessionKey?: string;
  tools: string[];
  workspaceDir: string;
}

async function loadFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

export async function buildSystemPrompt(params: SystemPromptParams): Promise<string> {
  const { workspaceDir } = params;

  // Load workspace files
  const [soul, agents, tools, memory] = await Promise.all([
    loadFile(join(workspaceDir, "SOUL.md")),
    loadFile(join(workspaceDir, "AGENTS.md")),
    loadFile(join(workspaceDir, "TOOLS.md")),
    loadFile(join(workspaceDir, "MEMORY.md")),
  ]);

  const parts: string[] = [];

  // Core identity from SOUL.md
  if (soul) {
    parts.push(soul.trim());
  } else {
    parts.push("You are Nexus, a personal AI assistant. You are helpful, concise, and capable of using tools to accomplish tasks.");
  }

  // Agent behavior from AGENTS.md
  if (agents) {
    parts.push(agents.trim());
  }

  // Tool docs from TOOLS.md
  if (tools) {
    parts.push(tools.trim());
  }

  // Persistent memory from MEMORY.md
  if (memory) {
    parts.push(memory.trim());
  }

  // Custom prompt from config
  if (params.customPrompt) {
    parts.push(params.customPrompt);
  }

  // Session context
  if (params.channel) {
    parts.push(`---\nCurrent channel: ${params.channel}. Session: ${params.sessionKey ?? "unknown"}.`);
  }

  const prompt = parts.join("\n\n");
  log.debug(`System prompt built: ${prompt.length} chars`);
  return prompt;
}
