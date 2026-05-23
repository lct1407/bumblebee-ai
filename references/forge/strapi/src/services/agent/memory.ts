import type { AIProvider, Message } from './provider';

const MEMORY_UID = 'api::memory.memory';
const MAX_MEMORIES = 20;

interface MemoryEntry {
  documentId: string;
  userKey: string;
  category: string;
  content: string;
  source: string;
  useCount: number;
  lastUsedAt: string | null;
}

/**
 * Get memories for a user in a project, ordered by usage. Touches returned memories.
 */
export async function getMemories(
  strapi: any,
  projectDocId: string,
  userKey: string,
  limit = MAX_MEMORIES,
): Promise<MemoryEntry[]> {
  const docs = strapi.documents(MEMORY_UID);
  const memories = await docs.findMany({
    filters: {
      project: { documentId: { $eq: projectDocId } },
      userKey: { $eq: userKey },
    },
    sort: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
    limit,
  });

  // Touch all returned memories (async, don't block)
  const now = new Date().toISOString();
  for (const m of memories) {
    docs.update({
      documentId: m.documentId,
      data: { lastUsedAt: now, useCount: (m.useCount || 1) + 1 },
    }).catch(() => {});
  }

  return memories as MemoryEntry[];
}

/**
 * Add a memory, deduplicating and capping at MAX_MEMORIES.
 */
export async function addMemory(
  strapi: any,
  projectDocId: string,
  userKey: string,
  category: string,
  content: string,
  source = 'auto',
): Promise<MemoryEntry> {
  const docs = strapi.documents(MEMORY_UID);

  // Check for duplicate
  const dup = await findDuplicate(strapi, projectDocId, userKey, content);
  if (dup) {
    await docs.update({
      documentId: dup.documentId,
      data: { lastUsedAt: new Date().toISOString(), useCount: (dup.useCount || 1) + 1 },
    });
    return dup;
  }

  // Enforce cap — remove least-used if at limit
  const all = await docs.findMany({
    filters: {
      project: { documentId: { $eq: projectDocId } },
      userKey: { $eq: userKey },
    },
    sort: [{ useCount: 'asc' }, { lastUsedAt: 'asc' }],
  });

  if (all.length >= MAX_MEMORIES) {
    await docs.delete({ documentId: all[0].documentId });
  }

  const created = await docs.create({
    data: {
      userKey,
      category,
      content,
      source,
      useCount: 1,
      lastUsedAt: new Date().toISOString(),
      project: { documentId: projectDocId },
    },
  });

  return created as MemoryEntry;
}

/**
 * Remove a memory by documentId.
 */
export async function removeMemory(strapi: any, docId: string): Promise<boolean> {
  try {
    await strapi.documents(MEMORY_UID).delete({ documentId: docId });
    return true;
  } catch {
    return false;
  }
}

/**
 * Substring-based duplicate detection (same as Nexus).
 */
async function findDuplicate(
  strapi: any,
  projectDocId: string,
  userKey: string,
  content: string,
): Promise<MemoryEntry | null> {
  const docs = strapi.documents(MEMORY_UID);
  const all = await docs.findMany({
    filters: {
      project: { documentId: { $eq: projectDocId } },
      userKey: { $eq: userKey },
    },
  });

  const normalized = content.toLowerCase().trim();
  for (const row of all) {
    const existing = (row.content as string).toLowerCase().trim();
    if (existing === normalized || existing.includes(normalized) || normalized.includes(existing)) {
      return row as MemoryEntry;
    }
  }
  return null;
}

/**
 * Format memories for injection into user message.
 */
export function formatMemories(memories: MemoryEntry[]): string {
  if (memories.length === 0) return '';
  return `[Memory: ${memories.map((m) => m.content).join(' | ')}]`;
}

// --- LLM-based extraction ---

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

/**
 * Extract memories from conversation using LLM (runs async, fire-and-forget).
 */
export async function extractMemories(
  provider: AIProvider,
  model: string,
  messages: Message[],
  strapi: any,
  projectDocId: string,
  userKey: string,
): Promise<void> {
  try {
    const existing = await getMemories(strapi, projectDocId, userKey);
    const existingStr =
      existing.length > 0
        ? existing.map((m) => `- ${m.content}`).join('\n')
        : '(none)';

    const recent = messages.slice(-5);
    const messagesStr = recent
      .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : '[complex]'}`)
      .join('\n');

    const prompt = EXTRACTION_PROMPT
      .replace('{existing_memories}', existingStr)
      .replace('{last_messages}', messagesStr);

    let responseText = '';
    for await (const event of provider.stream({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
    })) {
      if (event.type === 'text_delta') {
        responseText += event.text;
      }
    }

    const text = responseText.trim();
    if (!text || text === 'NONE') return;

    const lines = text.split('\n').filter((l) => l.includes('|'));
    for (const line of lines.slice(0, 3)) {
      const [category, ...factParts] = line.split('|');
      const fact = factParts.join('|').trim();
      const cat = category.trim().toLowerCase();
      if (fact && ['preference', 'context', 'correction'].includes(cat)) {
        await addMemory(strapi, projectDocId, userKey, cat, fact);
      }
    }
  } catch (err) {
    globalThis.strapi?.log?.warn?.(`Memory extraction failed: ${err}`);
  }
}
