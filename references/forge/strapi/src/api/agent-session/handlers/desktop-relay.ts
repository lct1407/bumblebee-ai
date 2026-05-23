import type { Context } from 'koa';
import { broadcast, sendToDesktop, sendToSession, registerDesktop as wsRegisterDesktop, unregisterDesktop as wsUnregisterDesktop, isDesktopConnected } from '../../../services/websocket';
import { sessionStreams, accumulateMessage } from '../services/stream-accumulator';
import { upsertAssistantMessage } from '../services/message-utils';

const UID = 'api::agent-session.agent-session' as any;

export async function relay(ctx: Context, strapi: any) {
  const { id } = ctx.params;
  const { event, data } = ctx.request.body as any;

  if (event === 'agent:batch') {
    // Batched messages from desktop — relay each to web clients + accumulate
    const items = data?.items || [];
    strapi.log.debug(`[relay] agent:batch sid=${id.slice(0,8)} items=${items.length}`);
    for (const item of items) {
      if (item.event === 'agent:message') {
        sendToSession(id, 'agent:message', { sessionId: id, ...item.data });
        accumulateMessage(strapi, id, item.data, UID);
      }
    }
  } else if (event === 'agent:message') {
    // Single message relay + accumulate
    sendToSession(id, 'agent:message', { sessionId: id, ...data });
    accumulateMessage(strapi, id, data, UID);
  } else if (event === 'agent:complete') {
    // Final flush: cancel pending timer and persist accumulated content
    const stream = sessionStreams.get(id);
    strapi.log.debug(`[relay] agent:complete sid=${id.slice(0,8)} accumTextLen=${stream?.text?.length || 0} toolCalls=${stream?.toolCalls?.length || 0}`);
    if (stream?.flushTimer) {
      clearTimeout(stream.flushTimer);
      stream.flushTimer = null;
    }

    const session: any = await strapi.documents(UID).findOne({ documentId: id });
    if (session) {
      const fullText = stream?.text || data?.fullMessage || '';
      const toolCalls = stream?.toolCalls?.length ? stream.toolCalls : data?.toolCalls;
      const contentBlocks = stream?.contentBlocks?.length ? stream.contentBlocks : undefined;
      const claudeSessionId = stream?.claudeSessionId || data?.claudeSessionId;

      const messages = [...(session.messages as any[] || [])];
      upsertAssistantMessage(messages, fullText, toolCalls, contentBlocks);

      const updateData: any = { status: data?.error ? 'failed' : 'completed', messages };
      if (claudeSessionId) updateData.claudeSessionId = claudeSessionId;
      if (stream?.usage && stream.usage.turns > 0) updateData.usage = stream.usage;
      if (data?.diff) updateData.diff = data.diff;

      await strapi.documents(UID).update({ documentId: id, data: updateData });
    }

    // Clean up accumulator
    sessionStreams.delete(id);

    sendToSession(id, 'agent:complete', { sessionId: id, ...data });
  }

  return { data: { ok: true } };
}

export async function buildPrompt(ctx: Context, strapi: any) {
  const { projectSlug, issueIds } = ctx.request.body as any;

  if (!projectSlug || !issueIds?.length) {
    ctx.status = 400;
    return { error: 'projectSlug and issueIds are required' };
  }

  if (!isDesktopConnected()) {
    ctx.status = 503;
    return { error: 'Desktop is not connected' };
  }

  const requestId = crypto.randomUUID();
  strapi.log.debug(`[build-prompt] sending to desktop: requestId=${requestId} projectSlug=${projectSlug} issueIds=${issueIds}`);
  sendToDesktop('agent:build-prompt', { requestId, projectSlug, issueIds });

  return { data: { requestId } };
}

export async function promptBuilt(ctx: Context, strapi: any) {
  const { requestId, prompt, error: buildError } = ctx.request.body as any;

  if (!requestId || (!prompt && !buildError)) {
    ctx.status = 400;
    return { error: 'requestId and (prompt or error) are required' };
  }

  strapi.log.debug(`[prompt-built] relaying: requestId=${requestId} hasPrompt=${!!prompt} error=${buildError || 'none'}`);
  broadcast('agent:prompt-built', { requestId, prompt, error: buildError });
  return { data: { ok: true } };
}

export async function registerDesktopHandler(_ctx: Context) {
  wsRegisterDesktop();
  return { data: { ok: true } };
}

export async function unregisterDesktopHandler(_ctx: Context) {
  wsUnregisterDesktop();
  return { data: { ok: true } };
}

export async function desktopStatus(_ctx: Context) {
  return { data: { connected: isDesktopConnected() } };
}
