import type { AIProvider, Message } from "../agent/provider.js";
import type { MemoryService, Memory } from "./service.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("memory-extractor");

const EXTRACTION_PROMPT = `Extract new facts about the user from this conversation.
Rules:
- Only STABLE facts (preferences, role, patterns), not one-off queries
- Max 3 facts per conversation
- Format each fact on its own line as: category|fact
- Categories: preference, context, correction
- If nothing new to remember, respond with exactly: NONE

Existing memories (don't duplicate):
{existing_memories}

Last messages:
{last_messages}`;

export async function extractMemories(
  provider: AIProvider,
  model: string,
  messages: Message[],
  userKey: string,
  memoryService: MemoryService,
): Promise<void> {
  try {
    const existing = memoryService.getMemories(userKey);
    const existingStr =
      existing.length > 0
        ? existing.map((m) => `- ${m.content}`).join("\n")
        : "(none)";

    // Take last 5 messages
    const recent = messages.slice(-5);
    const messagesStr = recent
      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : "[complex]"}`)
      .join("\n");

    const prompt = EXTRACTION_PROMPT
      .replace("{existing_memories}", existingStr)
      .replace("{last_messages}", messagesStr);

    // Collect the full response from streaming
    let responseText = "";
    for await (const event of provider.stream({
      model,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
    })) {
      if (event.type === "text_delta") {
        responseText += event.text;
      }
    }

    const text = responseText.trim();
    if (!text || text === "NONE") return;

    const lines = text.split("\n").filter((l) => l.includes("|"));
    for (const line of lines.slice(0, 3)) {
      const [category, ...factParts] = line.split("|");
      const fact = factParts.join("|").trim();
      const cat = category.trim().toLowerCase();
      if (fact && ["preference", "context", "correction"].includes(cat)) {
        memoryService.addMemory(userKey, cat, fact);
      }
    }
  } catch (err) {
    log.warn("Memory extraction failed", { error: err, userKey });
  }
}
