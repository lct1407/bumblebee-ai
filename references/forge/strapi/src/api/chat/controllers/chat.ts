import { createProvider, runAgent, getToolDefinitions, forgeTools, extractMemories } from '../../../services/agent';
import type { StreamEvent } from '../../../services/agent';
import { sendToSession } from '../../../services/websocket';
import { estimateCost } from '../../../services/pricing';
import { resolveProvider, MODEL_DEFAULTS } from '../services/chat-provider-factory';
import { loadOrCreateSession, persistSession } from '../services/chat-session-manager';
import { buildChatPrompt } from '../services/chat-prompt-builder';

export default {
  async send(ctx) {
    const strapi = globalThis.strapi;
    const { projectSlug, message, sessionId } = ctx.request.body as {
      projectSlug: string;
      message: string;
      sessionId?: string;
    };

    if (!projectSlug || !message || typeof message !== 'string') {
      return ctx.badRequest('projectSlug and message (string) required');
    }

    strapi.log.info(`Chat request: projectSlug=${projectSlug} msg="${message.slice(0, 100)}" sessionId=${sessionId || 'new'}`);

    // Find project
    const projects = await strapi.documents('api::project.project').findMany({
      filters: { slug: { $eq: projectSlug } },
    });
    const project = projects[0] as any;
    if (!project) return ctx.notFound('Project not found');

    // Provider setup
    const resolved = resolveProvider(project);
    if (!resolved) {
      return ctx.badRequest('No AI provider API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY env var.');
    }
    const { providerName, apiKey } = resolved;

    // Load or create session
    const session = await loadOrCreateSession(strapi, sessionId, message, project);

    // Derive userKey for memory
    const userKey = ctx.state.user?.id ? `user:${ctx.state.user.id}` : `session:${session.documentId}`;

    // Build prompt
    const { allMessages, systemPrompt } = await buildChatPrompt(strapi, project, session, message, providerName, userKey);

    // Create provider
    const provider = await createProvider(providerName, apiKey);
    const model = MODEL_DEFAULTS[providerName] || MODEL_DEFAULTS.gemini;
    const toolDefs = getToolDefinitions();

    // Abort controller
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    // Stream events via WebSocket
    const onEvent = (event: StreamEvent) => {
      if (event.type === 'text_delta') {
        sendToSession(session.documentId, 'chat:text_delta', { text: event.text });
      } else if (event.type === 'tool_use_start') {
        sendToSession(session.documentId, 'chat:tool_use', { id: event.id, name: event.name });
      } else if (event.type === 'message_end') {
        sendToSession(session.documentId, 'chat:done', { usage: event.usage });
      }
    };

    try {
      const result = await runAgent({
        provider,
        model,
        messages: allMessages,
        tools: forgeTools,
        toolDefinitions: toolDefs,
        systemPrompt,
        toolContext: {
          strapi: strapi,
          projectDocumentId: project.documentId,
          signal: controller.signal,
          userKey,
        },
        signal: controller.signal,
        onEvent,
      });

      // Persist full message transcript
      const updatedMessages = result.messages;
      const metadata = {
        ...(session.metadata || {}),
        lastUsage: result.usage,
        lastIterations: result.iterations,
        totalToolCalls: (session.metadata?.totalToolCalls || 0) + result.toolCalls.length,
      };
      await persistSession(strapi, session.documentId, updatedMessages, metadata);

      // Extract memories async (fire-and-forget)
      if (project.agentMemoryEnabled !== false) {
        extractMemories(provider, model, updatedMessages, strapi, project.documentId, userKey)
          .catch((err) => strapi.log.warn(`Memory extraction error: ${err}`));
      }

      // Auto-create usage record
      if (result.usage) {
        const u = result.usage;
        strapi.documents('api::usage-record.usage-record').create({
          data: {
            source: 'api',
            model,
            inputTokens: u.inputTokens || 0,
            outputTokens: u.outputTokens || 0,
            cacheReadTokens: u.cacheReadTokens || 0,
            cacheCreationTokens: u.cacheWriteTokens || 0,
            estimatedCost: estimateCost(model, u.inputTokens || 0, u.outputTokens || 0),
            requestCount: result.iterations || 1,
            sessionId: session.documentId,
            recordedAt: new Date().toISOString(),
            project: project.documentId,
          } as any,
        }).catch((err) => strapi.log.error(`Usage record error: ${err}`));
      }

      return {
        data: {
          sessionId: session.documentId,
          reply: result.text,
          usage: result.usage,
          iterations: result.iterations,
          toolCalls: result.toolCalls.map((tc) => ({
            name: tc.name,
            input: tc.input,
            durationMs: tc.durationMs,
            isError: tc.isError,
          })),
        },
      };
    } catch (err) {
      strapi.log.error(`Agent error: ${err}`);
      return ctx.internalServerError(`Agent error: ${err}`);
    } finally {
      clearTimeout(timeout);
    }
  },
};
