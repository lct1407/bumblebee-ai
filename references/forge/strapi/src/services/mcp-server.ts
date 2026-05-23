/**
 * MCP Streamable HTTP Server — embedded inside Strapi.
 *
 * Exposes the same forge tools (issues, tasks, comments) over the
 * MCP Streamable HTTP transport at POST/GET/DELETE /mcp.
 *
 * Uses **stateless transport** (no session IDs) to avoid session-expiry
 * errors that Claude Code doesn't auto-recover from.
 * Creates a fresh server+transport per request since stateless transports
 * don't support reuse.
 *
 * Uses dynamic import() for the MCP SDK since it's ESM-only and
 * Strapi uses CommonJS.
 */

import type { Core } from '@strapi/strapi';
import { forgeTools, type ForgeToolContext } from './agent/tools';

const toolMap = new Map(forgeTools.map((t) => [t.name, t]));


/** Lazily loaded MCP SDK modules */
let _sdk: {
  Server: any;
  StreamableHTTPServerTransport: any;
  ListToolsRequestSchema: any;
  CallToolRequestSchema: any;
} | null = null;

async function loadSdk() {
  if (_sdk) return _sdk;
  const [serverMod, transportMod, typesMod] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/index.js'),
    import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
    import('@modelcontextprotocol/sdk/types.js'),
  ]);
  _sdk = {
    Server: serverMod.Server,
    StreamableHTTPServerTransport: transportMod.StreamableHTTPServerTransport,
    ListToolsRequestSchema: typesMod.ListToolsRequestSchema,
    CallToolRequestSchema: typesMod.CallToolRequestSchema,
  };
  return _sdk;
}

/**
 * Create a fresh MCP server + transport per request.
 * Stateless transport doesn't support reuse across requests.
 */
async function createServerForRequest(strapi: Core.Strapi, projectDocumentId: string, sentryProject?: string) {
  const sdk = await loadSdk();

  const server = new sdk.Server(
    { name: 'forge-strapi-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(sdk.ListToolsRequestSchema, async () => ({
    tools: forgeTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    })),
  }));

  server.setRequestHandler(sdk.CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);
    if (!tool) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
    const ctx: ForgeToolContext = {
      strapi,
      projectDocumentId,
      signal: AbortSignal.timeout(30_000),
      sentryProject,
    };
    try {
      const result = await tool.execute((args ?? {}) as Record<string, unknown>, ctx);
      return { content: [{ type: 'text', text: result }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });

  const transport = new sdk.StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  transport.onerror = (err: any) => {
    console.error('[MCP] Transport error:', err);
  };

  server.onerror = (err: any) => {
    console.error('[MCP] Server error:', err);
  };

  await server.connect(transport);

  return { server, transport };
}

async function resolveProject(
  ctx: any,
  strapi: Core.Strapi,
): Promise<{ documentId: string } | null> {
  // Already resolved by forge-api-key middleware
  if (ctx.state?.forgeProject) {
    return { documentId: ctx.state.forgeProject.documentId };
  }

  const apiKey = ctx.request.headers['x-forge-api-key'] as string | undefined;
  const slug = ctx.request.headers['x-forge-project-slug'] as string | undefined;

  if (!apiKey && !slug) return null;

  // 1. Try global API key (requires slug to identify project)
  const globalKey = process.env.FORGE_GLOBAL_API_KEY || '';
  if (globalKey && apiKey === globalKey && slug) {
    const projects = await strapi.documents('api::project.project').findMany({
      filters: { slug: { $eq: slug } },
      limit: 1,
    });
    return projects.length > 0 ? { documentId: projects[0].documentId } : null;
  }

  // 2. Try project-specific API key (no slug needed)
  if (apiKey) {
    const byKey = await strapi.documents('api::project.project').findMany({
      filters: { apiKey: { $eq: apiKey } },
      limit: 1,
    });
    if (byKey.length > 0) {
      return { documentId: byKey[0].documentId };
    }
  }

  // 3. Resolve by slug alone (for desktop app — slug is trusted via internal network)
  if (slug) {
    const projects = await strapi.documents('api::project.project').findMany({
      filters: { slug: { $eq: slug } },
      limit: 1,
    });
    return projects.length > 0 ? { documentId: projects[0].documentId } : null;
  }

  return null;
}

/**
 * Koa middleware — handles MCP Streamable HTTP at /mcp.
 */
export function mcpMiddleware(strapi: Core.Strapi) {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.path !== '/mcp') return next();

    const method = ctx.method;

    // Auth: require API key or project slug
    const project = await resolveProject(ctx, strapi);
    if (!project) {
      ctx.status = 400;
      ctx.body = {
        error: 'Project context required. Set X-Forge-API-Key or X-Forge-Project-Slug header.',
      };
      return;
    }

    try {
      if (method === 'POST') {
        const sentryProject = (ctx.request.headers['x-sentry-project'] as string) || undefined;
        const { transport } = await createServerForRequest(strapi, project.documentId, sentryProject);
        await transport.handleRequest(ctx.req, ctx.res, ctx.request.body);
        ctx.respond = false;
        return;
      }

      if (method === 'GET') {
        const { transport } = await createServerForRequest(strapi, project.documentId);
        await transport.handleRequest(ctx.req, ctx.res);
        ctx.respond = false;
        return;
      }
    } catch (err: any) {
      console.error('[MCP] Error handling request:', err);
      ctx.status = 500;
      ctx.body = { error: err.message };
      return;
    }

    if (method === 'DELETE') {
      // Stateless — nothing to clean up, just acknowledge
      ctx.status = 200;
      ctx.body = { ok: true };
      return;
    }

    ctx.status = 405;
    ctx.body = { error: 'Method not allowed' };
  };
}
