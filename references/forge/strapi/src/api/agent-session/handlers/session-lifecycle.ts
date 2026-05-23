import type { Context } from 'koa';
import { sendToDesktop, sendToSession } from '../../../services/websocket';

const UID = 'api::agent-session.agent-session' as any;

export async function start(ctx: Context, strapi: any) {
  const { projectSlug, prompt, repoPath, origin, preBuilt, issueIds, type: sessionType } = ctx.request.body as any;

  const isReindex = sessionType?.endsWith('-reindex');
  const isAgentSession = !!sessionType;

  if (!projectSlug || (!prompt && !isAgentSession)) {
    ctx.status = 400;
    return { error: 'projectSlug and prompt are required' };
  }

  // Find project by slug
  const projects = await strapi.documents('api::project.project').findMany({
    filters: { slug: { $eq: projectSlug } },
    limit: 1,
  });
  const project = projects[0];
  if (!project) {
    ctx.status = 404;
    return { error: 'Project not found' };
  }

  // For agent-type sessions, look up the agent record and its definition
  let agentConfig: any;
  if (isAgentSession) {
    const agentType = isReindex ? sessionType.replace(/-reindex$/, '') : sessionType;
    const agents = await strapi.documents('api::agent.agent').findMany({
      filters: { project: { documentId: { $eq: project.documentId } }, type: { $eq: agentType } },
      populate: { definition: true },
      limit: 1,
    });
    agentConfig = agents[0];
    if (!agentConfig?.enabled && !isReindex) {
      ctx.status = 400;
      return { error: 'Agent is not enabled for this project' };
    }
  }

  const agentName = agentConfig?.name || sessionType;
  const effectivePrompt = prompt || (isReindex ? `${agentName}: Knowledge Reindex` : `${agentName}: Review`);
  const cleanTitle = isAgentSession
    ? (isReindex ? `${agentName} Reindex` : `${agentName} Review`)
    : effectivePrompt
        .replace(/^You are working on issue:\s*/i, '')
        .replace(/^You are working on the following issues:\s*/i, '')
        .replace(/^You are working on:\s*/i, '')
        .slice(0, 120);
  const now = Date.now();
  const messages = [{ role: 'user', content: effectivePrompt, timestamp: now }];

  const sessionData: any = {
    title: cleanTitle,
    status: 'running',
    messages,
    project: project.documentId,
    repoPath: repoPath || (project as any).repoPath || '',
    metadata: isAgentSession ? { type: sessionType } : {},
  };

  // Link to issues if issueIds provided
  if (issueIds?.length) {
    sessionData.issues = issueIds;
  }

  const session = await strapi.documents(UID).create({ data: sessionData });

  const sid = session.documentId;
  const rp = repoPath || (project as any).repoPath || '';

  // Notify web subscribers of the user message (for desktop-originated sessions)
  if (origin === 'desktop') {
    sendToSession(sid, 'agent:user-message', { sessionId: sid, content: effectivePrompt });
  }

  // Send agent command to desktop — defer slightly so web client can subscribe first
  if (origin !== 'desktop') {
    if (isAgentSession) {
      // Agent: send specialized event with config + definition so desktop can build the prompt
      const agentEvent = isReindex ? 'agent:reindex' : 'agent:review';
      setTimeout(() => {
        sendToDesktop(agentEvent, { sessionId: sid, repoPath: rp, projectSlug, agentConfig });
      }, 500);
    } else {
      setTimeout(() => {
        sendToDesktop('agent:start', { sessionId: sid, repoPath: rp, prompt, projectSlug, preBuilt });
      }, 500);
    }
  }

  ctx.status = 201;
  return { data: session };
}

export async function send(ctx: Context, strapi: any) {
  const { sessionId, message, claudeSessionId, origin } = ctx.request.body as any;

  if (!sessionId || !message) {
    ctx.status = 400;
    return { error: 'sessionId and message are required' };
  }

  const session: any = await strapi.documents(UID).findOne({ documentId: sessionId, populate: ['project'] });
  if (!session) {
    ctx.status = 404;
    return { error: 'Session not found' };
  }

  // Append user message
  const messages = [...(session.messages || []), { role: 'user', content: message, timestamp: Date.now() }];
  await strapi.documents(UID).update({
    documentId: sessionId,
    data: { messages, status: 'running' } as any,
  });

  // Notify web subscribers of the user message (only for desktop-originated sends)
  if (origin === 'desktop') {
    sendToSession(sessionId, 'agent:user-message', { sessionId, content: message });
  }

  // Send to desktop — defer slightly so web client can subscribe first
  if (origin !== 'desktop') {
    const rp = session.repoPath || '';
    const ps = session.project?.slug || '';
    const csid = claudeSessionId || session.claudeSessionId;
    setTimeout(() => {
      sendToDesktop('agent:send', { sessionId, message, claudeSessionId: csid, repoPath: rp, projectSlug: ps });
    }, 500);
  }

  return { data: { ok: true } };
}

export async function abort(ctx: Context, strapi: any) {
  const { sessionId } = ctx.request.body as any;

  if (!sessionId) {
    ctx.status = 400;
    return { error: 'sessionId is required' };
  }

  await strapi.documents(UID).update({
    documentId: sessionId,
    data: { status: 'idle' } as any,
  });

  sendToDesktop('agent:abort', { sessionId });

  return { data: { ok: true } };
}
