import type { ToolDefinition } from './provider';
import { forgeMemory } from './memory-tool';
import { forgeCoolifyDeploy } from './coolify-tool';
import { forgeSentry } from './sentry-tool';
import { forgeSkills } from './skills-tool';

export interface ForgeToolContext {
  strapi: any;
  projectDocumentId: string;
  signal: AbortSignal;
  userKey?: string;
  sentryProject?: string;
}

export interface ForgeTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: Record<string, unknown>, ctx: ForgeToolContext): Promise<string>;
}

function toolToDefinition(tool: ForgeTool): ToolDefinition {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

const forgeIssues: ForgeTool = {
  name: 'forge_issues',
  description:
    'Query and manage project issues. Use "list" to search/filter issues — omit filters to get ALL issues, or use status/statusNot/priority to narrow results. Use "create" to add a new issue (title required). Use "get" for full issue details. Use "update" to modify fields.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update'],
        description: 'The action to perform',
      },
      filters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'confirmed', 'approved', 'in_progress', 'resolved', 'closed', 'reopen', 'failed', 'needs_info'], description: 'Match issues with this exact status' },
          statusNot: { type: 'string', enum: ['open', 'confirmed', 'approved', 'in_progress', 'resolved', 'closed', 'reopen', 'failed', 'needs_info'], description: 'Exclude issues with this status (e.g. "resolved" to find unresolved issues)' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
          category: { type: 'string' },
        },
        description: 'Optional filters. Omit entirely to list all issues. For "not resolved" questions, use statusNot or list all and summarize.',
      },
      documentId: {
        type: 'string',
        description: 'Document ID for get/update actions',
      },
      data: {
        type: 'object',
        description: 'For create: title (required), description, status, priority, category, acceptanceCriteria, suggestedSolution, attachments (array of media IDs). For update: any field to change including attachments and plan (markdown text for implementation plan).',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;
    const docs = ctx.strapi.documents('api::issue.issue');

    if (action === 'list') {
      const filters: Record<string, any> = {
        project: { documentId: { $eq: ctx.projectDocumentId } },
      };
      const f = input.filters as Record<string, string> | undefined;
      if (f?.status) filters.status = { $eq: f.status };
      else if (f?.statusNot) filters.status = { $ne: f.statusNot };
      if (f?.priority) filters.priority = { $eq: f.priority };
      if (f?.category) filters.category = { $eq: f.category };

      const issues = await docs.findMany({
        filters,
        populate: ['tasks'],
      });

      return JSON.stringify(
        issues.map((i: any) => ({
          issueId: `ISS-${i.id}`,
          documentId: i.documentId,
          title: i.title,
          status: i.status,
          priority: i.priority,
          category: i.category,
          taskCount: i.tasks?.length ?? 0,
          createdAt: i.createdAt,
        })),
      );
    }

    if (action === 'create') {
      const data = input.data as Record<string, any>;
      if (!data?.title) return 'Error: data.title required for create action';
      const createData: Record<string, any> = {
        title: data.title,
        description: data.description,
        status: data.status || 'open',
        priority: data.priority || 'medium',
        category: data.category,
        acceptanceCriteria: data.acceptanceCriteria,
        suggestedSolution: data.suggestedSolution,
        project: { documentId: ctx.projectDocumentId },
      };
      if (data.attachments) createData.attachments = data.attachments;
      const created = await docs.create({ data: createData });
      return JSON.stringify({ issueId: `ISS-${created.id}`, documentId: created.documentId, title: created.title, status: 'created' });
    }

    if (action === 'get') {
      const id = input.documentId as string;
      if (!id) return 'Error: documentId required for get action';
      const issue = await docs.findOne({ documentId: id, populate: ['tasks', 'comments'] }) as any;
      if (!issue) return 'Issue not found';

      const result: any = {
        issueId: `ISS-${issue.id}`,
        documentId: issue.documentId,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        category: issue.category,
        acceptanceCriteria: issue.acceptanceCriteria,
        suggestedSolution: issue.suggestedSolution,
        plan: issue.plan,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        tasks: issue.tasks?.map((t: any) => ({
          documentId: t.documentId,
          title: t.title,
          status: t.status,
        })) ?? [],
        comments: issue.comments?.map((c: any) => ({
          documentId: c.documentId,
          body: c.body,
          author: c.author,
          createdAt: c.createdAt,
        })) ?? [],
      };

      if (Array.isArray(issue.changeHistory) && issue.changeHistory.length > 0) {
        result.changeHistory = issue.changeHistory.map((e: any) =>
          `[${e.at}] ${e.by} changed ${e.field} from "${e.from ?? 'none'}" to "${e.to}"`
        );
      }

      return JSON.stringify(result);
    }

    if (action === 'update') {
      const id = input.documentId as string;
      const data = input.data as Record<string, unknown>;
      if (!id || !data) return 'Error: documentId and data required for update action';
      const { _historyActor: _, ...cleanData } = data as Record<string, unknown> & { _historyActor?: unknown };
      const updated = await docs.update({ documentId: id, data: cleanData });
      return JSON.stringify({ documentId: updated.documentId, ...data, status: 'updated' });
    }

    return `Unknown action: ${action}`;
  },
};

const forgeTasks: ForgeTool = {
  name: 'forge_tasks',
  description:
    'Query and manage project tasks. Use action "list" to search/filter tasks — omit filters to get ALL tasks. Use "get" for full task details. Use "create" to add new tasks. Use "update" to change task status or other fields.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update'],
        description: 'The action to perform',
      },
      filters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'] },
          statusNot: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'], description: 'Exclude tasks with this status' },
          issue: { type: 'string', description: 'Issue documentId to filter tasks by parent issue' },
        },
        description: 'Optional filters. Omit entirely to list all tasks.',
      },
      documentId: { type: 'string', description: 'Document ID for get/update actions' },
      data: {
        type: 'object',
        description: 'Task data: title, description, status, issue (documentId of parent issue)',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;
    const docs = ctx.strapi.documents('api::task.task');

    if (action === 'list') {
      const filters: Record<string, any> = {
        project: { documentId: { $eq: ctx.projectDocumentId } },
      };
      const f = input.filters as Record<string, string> | undefined;
      if (f?.status) filters.status = { $eq: f.status };
      else if (f?.statusNot) filters.status = { $ne: f.statusNot };
      if (f?.issue) filters.issue = { documentId: { $eq: f.issue } };

      const tasks = await docs.findMany({ filters });
      return JSON.stringify(
        tasks.map((t: any) => ({
          documentId: t.documentId,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
      );
    }

    if (action === 'get') {
      const id = input.documentId as string;
      if (!id) return 'Error: documentId required for get action';
      const task = await docs.findOne({ documentId: id, populate: ['issue'] }) as any;
      if (!task) return 'Task not found';
      return JSON.stringify({
        documentId: task.documentId,
        title: task.title,
        description: task.description,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        issue: task.issue ? { documentId: task.issue.documentId, title: task.issue.title } : null,
      });
    }

    if (action === 'create') {
      const data = input.data as Record<string, any>;
      if (!data?.title) return 'Error: data.title required for create action';
      const createData: Record<string, any> = {
        title: data.title,
        description: data.description,
        status: data.status || 'todo',
        project: { documentId: ctx.projectDocumentId },
      };
      if (data.issue) {
        createData.issue = { documentId: data.issue };
      }
      const created = await docs.create({ data: createData });
      return JSON.stringify({ documentId: created.documentId, title: created.title, status: 'created' });
    }

    if (action === 'update') {
      const id = input.documentId as string;
      const data = input.data as Record<string, unknown>;
      if (!id || !data) return 'Error: documentId and data required for update action';
      const updated = await docs.update({ documentId: id, data });
      return JSON.stringify({ documentId: updated.documentId, ...data, status: 'updated' });
    }

    return `Unknown action: ${action}`;
  },
};

const forgeComments: ForgeTool = {
  name: 'forge_comments',
  description: 'Query and manage issue comments. Use "list" to get comments (optionally filtered by issue). Use "create" to add a new comment to an issue.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create'],
        description: 'The action to perform',
      },
      filters: {
        type: 'object',
        properties: {
          issue: { type: 'string', description: 'Issue documentId to filter by' },
        },
        description: 'Filters for list action',
      },
      data: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'Comment text' },
          issue: { type: 'string', description: 'Issue documentId' },
          author: { type: 'string', description: 'Author name (optional)' },
        },
        description: 'Comment data for create action',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;
    const docs = ctx.strapi.documents('api::comment.comment');

    if (action === 'list') {
      const filters: Record<string, any> = {};
      const f = input.filters as Record<string, string> | undefined;
      if (f?.issue) filters.issue = { documentId: { $eq: f.issue } };

      const comments = await docs.findMany({ filters, populate: ['issue'] });
      return JSON.stringify(
        comments.map((c: any) => ({
          documentId: c.documentId,
          body: c.body,
          author: c.author,
          createdAt: c.createdAt,
        })),
      );
    }

    if (action === 'create') {
      const data = input.data as Record<string, any>;
      if (!data?.body || !data?.issue) return 'Error: data.body and data.issue required';
      const created = await docs.create({
        data: {
          body: data.body,
          author: data.author || 'Forge AI',
          issue: { documentId: data.issue },
        },
      });
      return JSON.stringify({ documentId: created.documentId, status: 'created' });
    }

    return `Unknown action: ${action}`;
  },
};

const forgeAgentSessions: ForgeTool = {
  name: 'forge_agent_sessions',
  description:
    'Start and manage AI agent sessions. Use "start" to create a new agent session that runs on the desktop agent — provide a prompt and optionally link issue documentIds. Use "list" to see existing sessions. Use "get" for full session details including messages. Use "send" to send a follow-up message to a running session.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'list', 'get', 'send'],
        description: 'The action to perform',
      },
      data: {
        type: 'object',
        description: 'For start: prompt (required), issueIds (optional array of issue documentId values — use the documentId field from forge_issues, NOT the issueId/ISS-* display ID), preview (optional boolean — if true, sends prompt to web UI for review instead of starting immediately). For send: sessionId (required), message (required).',
      },
      documentId: {
        type: 'string',
        description: 'Session documentId for get action',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;
    const UID = 'api::agent-session.agent-session' as any;
    const docs = ctx.strapi.documents(UID);

    if (action === 'list') {
      const sessions = await docs.findMany({
        filters: { project: { documentId: { $eq: ctx.projectDocumentId } } },
        sort: { createdAt: 'desc' },
        limit: 20,
      });
      return JSON.stringify(
        sessions.map((s: any) => ({
          documentId: s.documentId,
          title: s.title,
          status: s.status,
          createdAt: s.createdAt,
        })),
      );
    }

    if (action === 'get') {
      const id = input.documentId as string;
      if (!id) return 'Error: documentId required for get action';
      const session = await docs.findOne({ documentId: id, populate: ['issues'] }) as any;
      if (!session) return 'Session not found';
      // Return only the last 10 messages to avoid huge payloads
      const messages = Array.isArray(session.messages) ? session.messages.slice(-10) : [];
      return JSON.stringify({
        documentId: session.documentId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length ?? 0,
        recentMessages: messages.map((m: any) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content,
          timestamp: m.timestamp,
        })),
        issues: session.issues?.map((i: any) => ({
          documentId: i.documentId,
          title: i.title,
          status: i.status,
        })),
      });
    }

    if (action === 'start') {
      const data = input.data as Record<string, any>;
      if (!data?.prompt) return 'Error: data.prompt required for start action';

      const { sendToDesktop, isDesktopConnected, broadcast } = require('../../services/websocket');
      if (!isDesktopConnected()) {
        return 'Error: Desktop agent is not connected. Cannot start agent session.';
      }

      // Resolve project for repoPath/slug
      const projects = await ctx.strapi.documents('api::project.project').findMany({
        filters: { documentId: { $eq: ctx.projectDocumentId } },
        limit: 1,
      });
      const project = projects[0] as any;
      if (!project) return 'Error: Project not found';

      const prompt = data.prompt as string;
      const issueIds = data.issueIds?.length ? data.issueIds : [];

      // Preview mode: send prompt to web UI for review instead of starting directly
      if (data.preview) {
        broadcast('agent:preview-prompt', {
          prompt,
          issueIds,
          projectSlug: project.slug,
        });
        return JSON.stringify({
          status: 'preview',
          message: 'Prompt sent to web UI for review. User can edit and start the session from the agent page.',
        });
      }

      const title = prompt
        .replace(/^You are working on issue:\s*/i, '')
        .replace(/^You are working on the following issues:\s*/i, '')
        .replace(/^You are working on:\s*/i, '')
        .slice(0, 120);
      const now = Date.now();
      const messages = [{ role: 'user', content: prompt, timestamp: now }];

      const sessionData: any = {
        title,
        status: 'running',
        messages,
        project: project.documentId,
        repoPath: project.repoPath || '',
        metadata: {},
      };

      if (issueIds.length) {
        sessionData.issues = issueIds;
      }

      const session = await docs.create({ data: sessionData });
      const sid = session.documentId;
      const rp = project.repoPath || '';

      // Send agent command to desktop
      setTimeout(() => {
        sendToDesktop('agent:start', { sessionId: sid, repoPath: rp, prompt, projectSlug: project.slug });
      }, 500);

      return JSON.stringify({
        documentId: sid,
        title,
        status: 'running',
        message: 'Agent session started. Desktop agent is executing the prompt.',
      });
    }

    if (action === 'send') {
      const data = input.data as Record<string, any>;
      if (!data?.sessionId || !data?.message) return 'Error: data.sessionId and data.message required for send action';

      const { sendToDesktop, isDesktopConnected } = require('../../services/websocket');
      if (!isDesktopConnected()) {
        return 'Error: Desktop agent is not connected.';
      }

      const session: any = await docs.findOne({ documentId: data.sessionId });
      if (!session) return 'Error: Session not found';

      const msg = { role: 'user', content: data.message, timestamp: Date.now() };
      const updatedMessages = [...(session.messages || []), msg];
      await docs.update({ documentId: data.sessionId, data: { messages: updatedMessages } });

      sendToDesktop('agent:send', {
        sessionId: data.sessionId,
        message: data.message,
        claudeSessionId: session.claudeSessionId,
      });

      return JSON.stringify({ documentId: data.sessionId, status: 'message_sent' });
    }

    return `Unknown action: ${action}`;
  },
};

const forgeTodoWrite: ForgeTool = {
  name: 'TodoWrite',
  description:
    'Report your progress by writing a todo checklist. Call this tool whenever you start a new phase of work to update the UI with your current progress. Each call replaces the previous checklist.',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Description of the task' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            activeForm: { type: 'string', description: 'What is currently being done (shown when status is in_progress)' },
          },
          required: ['content', 'status'],
        },
        description: 'List of todo items with their current status',
      },
    },
    required: ['todos'],
  },
  async execute() {
    // No-op — TodoWrite is for UI display only. The stream events
    // forward the tool_use block to the frontend which renders it
    // as a progress checklist.
    return 'ok';
  },
};

export const forgeTools: ForgeTool[] = [forgeIssues, forgeTasks, forgeComments, forgeAgentSessions, forgeMemory, forgeCoolifyDeploy, forgeSentry, forgeSkills, forgeTodoWrite];

export function getToolDefinitions(): ToolDefinition[] {
  return forgeTools.map(toolToDefinition);
}

export function getToolMap(): Map<string, ForgeTool> {
  return new Map(forgeTools.map((t) => [t.name, t]));
}
