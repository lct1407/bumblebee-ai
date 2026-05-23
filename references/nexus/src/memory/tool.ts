import type { AgentTool } from "../agent/tools.js";
import type { MemoryService } from "./service.js";

export function createMemoryTool(memoryService: MemoryService): AgentTool {
  return {
    name: "memory_update",
    description:
      "Manage persistent user memories. Use when the user explicitly asks you to remember, forget, or list what you know about them.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "remove", "list"],
          description: "Action to perform",
        },
        content: {
          type: "string",
          description: "Fact to remember (for add)",
        },
        category: {
          type: "string",
          enum: ["preference", "context", "correction"],
          description: "Memory category (for add)",
        },
        memoryId: {
          type: "number",
          description: "Memory ID to remove (for remove)",
        },
      },
      required: ["action"],
    },
    async execute(input, ctx) {
      const action = input.action as string;
      const userKey = ctx.sessionKey;

      if (action === "list") {
        const memories = memoryService.getMemories(userKey);
        if (memories.length === 0) return "No memories stored for this user.";
        return memories
          .map(
            (m) =>
              `[${m.id}] (${m.category}) ${m.content} — used ${m.use_count}x`,
          )
          .join("\n");
      }

      if (action === "add") {
        const content = input.content as string;
        const category = (input.category as string) ?? "context";
        if (!content) return "Error: content is required for add action.";
        const mem = memoryService.addMemory(userKey, category, content, "manual");
        return `Memory saved: [${mem.id}] (${category}) ${content}`;
      }

      if (action === "remove") {
        const memoryId = input.memoryId as number;
        if (!memoryId) return "Error: memoryId is required for remove action.";
        const removed = memoryService.removeMemory(memoryId);
        return removed
          ? `Memory ${memoryId} removed.`
          : `Memory ${memoryId} not found.`;
      }

      return `Unknown action: ${action}`;
    },
  };
}
