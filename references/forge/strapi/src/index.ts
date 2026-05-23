import type { Core } from '@strapi/strapi';
import { initWebSocket } from './services/websocket';
import { seedApiPermissions } from './bootstrap/seeds/api-permissions';
import { seedAgentDefinitions } from './bootstrap/seeds/agent-definitions';
import { mcpMiddleware } from './services/mcp-server';
import { subscribeIssueLifecycles } from './lifecycles/issue-lifecycle';
import { subscribeTaskLifecycles } from './lifecycles/task-lifecycle';
import { subscribeProjectLifecycles, backfillProjectAgents } from './lifecycles/project-lifecycle';
import { subscribeSkillLifecycles } from './lifecycles/skill-lifecycle';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // DEBUG: Monkey-patch strapi.db.query to trace who selects 'project' from issues
    const origQuery = strapi.db.query.bind(strapi.db);
    (strapi.db as any).query = (uid: string) => {
      const q = origQuery(uid);
      if (uid === 'api::issue.issue') {
        const origFindOne = q.findOne.bind(q);
        q.findOne = (params: any) => {
          if (params?.select && JSON.stringify(params.select).includes('project')) {
            strapi.log.error(`[DB DEBUG] issue findOne with project in select!`);
            strapi.log.error(`[DB DEBUG] params: ${JSON.stringify(params)}`);
            strapi.log.error(`[DB DEBUG] caller: ${new Error().stack}`);
          }
          return origFindOne(params);
        };
      }
      return q;
    };

    initWebSocket(strapi);
    await seedApiPermissions(strapi);
    await seedAgentDefinitions(strapi);

    // Mount MCP Streamable HTTP endpoint at /mcp
    strapi.server.use(mcpMiddleware(strapi));

    // Register lifecycle hooks
    subscribeIssueLifecycles(strapi);
    subscribeTaskLifecycles(strapi);
    subscribeProjectLifecycles(strapi);
    subscribeSkillLifecycles(strapi);

    // Backfill agents for existing projects (reads definitions from DB)
    await backfillProjectAgents(strapi);
  },
};
