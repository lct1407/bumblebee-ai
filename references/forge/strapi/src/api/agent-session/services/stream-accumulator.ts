// In-memory accumulator for streamed assistant content per session
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: { id: string; name: string; input?: any; result?: string; isError?: boolean } };

export interface SessionUsage {
  contextUsed: number;
  outputTotal: number;
  cacheRead: number;
  turns: number;
}

export interface SessionStream {
  text: string;
  claudeSessionId?: string;
  toolCalls: { id: string; name: string; input?: any; result?: string; isError?: boolean }[];
  contentBlocks: ContentBlock[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  usage: SessionUsage;
  _lastActivity: number;
}

const FLUSH_INTERVAL = 3000; // persist every 3 seconds
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes — auto-cleanup orphaned streams
const EMPTY_USAGE: SessionUsage = { contextUsed: 0, outputTotal: 0, cacheRead: 0, turns: 0 };

export const sessionStreams = new Map<string, SessionStream>();

// Periodic cleanup of stale session streams (orphaned due to missed agent:complete)
setInterval(() => {
  const now = Date.now();
  for (const [sid, stream] of sessionStreams) {
    if (now - stream._lastActivity > SESSION_TTL) {
      if (stream.flushTimer) clearTimeout(stream.flushTimer);
      sessionStreams.delete(sid);
    }
  }
}, 5 * 60 * 1000); // check every 5 minutes

export function getStream(sessionId: string): SessionStream {
  let s = sessionStreams.get(sessionId);
  if (!s) {
    s = { text: '', toolCalls: [], contentBlocks: [], flushTimer: null, usage: { ...EMPTY_USAGE }, _lastActivity: Date.now() };
    sessionStreams.set(sessionId, s);
  }
  return s;
}

export async function flushStream(strapi: any, sessionId: string, UID: any) {
  const stream = sessionStreams.get(sessionId);
  if (!stream || (!stream.text && stream.toolCalls.length === 0)) return;

  const { upsertAssistantMessage } = await import('./message-utils');

  try {
    const session: any = await strapi.documents(UID).findOne({ documentId: sessionId });
    if (!session) return;

    const messages = [...(session.messages as any[] || [])];
    upsertAssistantMessage(messages, stream.text, stream.toolCalls, stream.contentBlocks, { streaming: true });

    const updateData: any = { messages };
    if (stream.claudeSessionId) updateData.claudeSessionId = stream.claudeSessionId;
    if (stream.usage.turns > 0) updateData.usage = stream.usage;
    await strapi.documents(UID).update({ documentId: sessionId, data: updateData });
  } catch { /* ignore flush errors */ }
}

export function scheduleFlush(strapi: any, sessionId: string, UID: any) {
  const stream = getStream(sessionId);
  if (stream.flushTimer) return;
  stream.flushTimer = setTimeout(async () => {
    stream.flushTimer = null;
    await flushStream(strapi, sessionId, UID);
  }, FLUSH_INTERVAL);
}

export function accumulateMessage(strapi: any, sessionId: string, agentData: any, UID: any) {
  const stream = getStream(sessionId);
  const type = agentData.type;
  const content = agentData.message?.content;
  const textSnippet = Array.isArray(content) ? content.find((b: any) => b.type === 'text')?.text?.slice(0, 60) : '';
  strapi.log.debug(`[accumulate] sid=${sessionId.slice(0,8)} type=${type} textLen=${stream.text.length} snippet="${textSnippet}"`);

  // Claude CLI sends message.content as an array of blocks
  if (type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        stream.text += block.text;
        // Merge consecutive text blocks
        const last = stream.contentBlocks[stream.contentBlocks.length - 1];
        if (last?.type === 'text') {
          last.text += block.text;
        } else {
          stream.contentBlocks.push({ type: 'text', text: block.text });
        }
      } else if (block.type === 'tool_use') {
        const tc = { id: block.id, name: block.name, input: block.input };
        stream.toolCalls.push(tc);
        stream.contentBlocks.push({ type: 'tool_use', tool: tc });
      }
    }
  } else if (type === 'user' && Array.isArray(content)) {
    // tool_result blocks come as user messages
    for (const block of content) {
      if (block.type === 'tool_result') {
        const tc = stream.toolCalls.find((t) => t.id === block.tool_use_id);
        if (tc) {
          tc.result = block.content;
          tc.isError = block.is_error;
        }
        // Also update in contentBlocks
        const cb = stream.contentBlocks.find(
          (b): b is Extract<ContentBlock, { type: 'tool_use' }> =>
            b.type === 'tool_use' && b.tool.id === block.tool_use_id
        );
        if (cb) {
          cb.tool.result = block.content;
          cb.tool.isError = block.is_error;
        }
      }
    }
  }

  // Track usage from assistant messages (usage may be at top level or inside message)
  const usageData = agentData.usage || agentData.message?.usage;
  if (type === 'assistant' && usageData) {
    const u = usageData;
    stream.usage.contextUsed = u.input_tokens || stream.usage.contextUsed;
    stream.usage.outputTotal += u.output_tokens || 0;
    stream.usage.cacheRead += u.cache_read_input_tokens || 0;
    stream.usage.turns += 1;
  }

  if (agentData.session_id) {
    stream.claudeSessionId = agentData.session_id;
  }
  stream._lastActivity = Date.now();
  scheduleFlush(strapi, sessionId, UID);
}
