import { getToolDefinitions, getMemories, buildSystemPrompt } from '../../../services/agent';
import type { Message, PromptContext } from '../../../services/agent';
import { MODEL_DEFAULTS } from './chat-provider-factory';

/**
 * Build the full messages array and system prompt for the agent.
 */
export async function buildChatPrompt(
  strapi: any,
  project: any,
  session: any,
  message: string,
  providerName: string,
  userKey: string,
): Promise<{ allMessages: Message[]; systemPrompt: string }> {
  // Build messages from session history + new user message
  const history: Message[] = session.messages || [];
  const userMessage: Message = { role: 'user', content: message };
  const allMessages: Message[] = [...history, userMessage];

  // Fetch memories for system prompt
  let memories: any[] = [];
  if (project.agentMemoryEnabled !== false) {
    try {
      memories = await getMemories(strapi, project.documentId, userKey);
    } catch (err) {
      strapi.log.warn(`Memory fetch failed: ${err}`);
    }
  }

  // Build layered system prompt
  const toolDefs = getToolDefinitions();
  const promptCtx: PromptContext = {
    projectName: project.name || project.slug,
    projectDescription: project.description,
    agentPrompt: project.agentPrompt,
    knowledgeIndex: project.knowledgeIndex,
    repos: project.repos,
    userKey,
    sessionSource: (session.source || 'web') as 'web' | 'widget',
    memories,
    providerName,
    model: MODEL_DEFAULTS[providerName] || MODEL_DEFAULTS.gemini,
    tools: toolDefs,
    totalToolCalls: session.metadata?.totalToolCalls || 0,
  };
  const systemPrompt = buildSystemPrompt(promptCtx);

  return { allMessages, systemPrompt };
}
