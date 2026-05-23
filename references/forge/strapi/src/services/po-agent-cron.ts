import type { Core } from '@strapi/strapi';
import { sendToDesktop, isDesktopConnected } from './websocket';

const AGENT_UID = 'api::agent.agent' as any;
const SESSION_UID = 'api::agent-session.agent-session' as any;

function shouldRunToday(schedule: string): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const date = now.getUTCDate();

  switch (schedule) {
    case 'weekly':
      return day === 1; // Every Monday
    case 'biweekly':
      // Every other Monday (weeks where ISO week number is even)
      if (day !== 1) return false;
      const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
      return weekNum % 2 === 0;
    case 'monthly':
      return date === 1; // First day of month
    default:
      return false;
  }
}

export async function triggerScheduledPoReviews(strapi: Core.Strapi) {
  if (!isDesktopConnected()) {
    strapi.log.debug('PO Agent cron: desktop not connected, skipping');
    return;
  }

  // Query all enabled agents with a schedule, populate project and definition
  const agents = await strapi.documents(AGENT_UID).findMany({
    filters: { enabled: true, schedule: { $ne: 'off' } },
    populate: { project: true, definition: true },
    limit: 100,
  });

  for (const agent of agents) {
    const project = (agent as any).project;
    if (!project) continue;
    if (!shouldRunToday((agent as any).schedule)) continue;

    strapi.log.info(`PO Agent cron: triggering review for project "${project.name}" (${project.slug}), agent "${(agent as any).name}"`);

    const agentName = (agent as any).name || 'Agent';
    const agentType = (agent as any).type || 'unknown';
    const session = await strapi.documents(SESSION_UID).create({
      data: {
        title: `${agentName} Review (Scheduled)`,
        status: 'running',
        messages: [{ role: 'user', content: `${agentName}: Scheduled Review`, timestamp: Date.now() }],
        project: project.documentId,
        repoPath: project.repoPath || '',
        metadata: { type: agentType, scheduled: true },
      } as any,
    });

    sendToDesktop('agent:review', {
      sessionId: session.documentId,
      repoPath: project.repoPath || '',
      projectSlug: project.slug,
      agentConfig: agent,
    });
  }
}
