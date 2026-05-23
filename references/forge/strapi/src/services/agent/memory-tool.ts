import type { ForgeTool } from './tools';
import { getMemories, addMemory, removeMemory } from './memory';

export const forgeMemory: ForgeTool = {
  name: 'forge_memory',
  description:
    'Manage user memories. Use "list" to see stored memories. Use "add" to save a new fact (category: preference/context/correction). Use "remove" to delete a memory by documentId.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'add', 'remove'],
        description: 'The action to perform',
      },
      category: {
        type: 'string',
        enum: ['preference', 'context', 'correction'],
        description: 'Memory category (for add action)',
      },
      content: {
        type: 'string',
        description: 'The fact to remember (for add action)',
      },
      documentId: {
        type: 'string',
        description: 'Memory documentId (for remove action)',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;
    // Use a default userKey from context — the tool doesn't know the real user
    const userKey = ctx.userKey || `project:${ctx.projectDocumentId}`;

    if (action === 'list') {
      const memories = await getMemories(ctx.strapi, ctx.projectDocumentId, userKey);
      if (memories.length === 0) return 'No memories stored yet.';
      return JSON.stringify(
        memories.map((m) => ({
          documentId: m.documentId,
          category: m.category,
          content: m.content,
          useCount: m.useCount,
        })),
      );
    }

    if (action === 'add') {
      const category = input.category as string;
      const content = input.content as string;
      if (!category || !content) return 'Error: category and content required for add action';
      const memory = await addMemory(ctx.strapi, ctx.projectDocumentId, userKey, category, content, 'manual');
      return JSON.stringify({ documentId: memory.documentId, content: memory.content, status: 'added' });
    }

    if (action === 'remove') {
      const docId = input.documentId as string;
      if (!docId) return 'Error: documentId required for remove action';
      const removed = await removeMemory(ctx.strapi, docId);
      return removed ? 'Memory removed.' : 'Memory not found.';
    }

    return `Unknown action: ${action}`;
  },
};
