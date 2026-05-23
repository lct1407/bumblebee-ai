import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { enrichIssue } from '../../../services/ai-enrichment';
import { parseQueryParams, paginationMeta } from '../../../services/query-params';

const UID = 'api::issue.issue' as const;

export default factories.createCoreController(UID, ({ strapi }) => ({
  async find(ctx: Context) {
    const params = parseQueryParams(ctx.query);
    const results = await strapi.documents(UID).findMany(params);
    const total = await strapi.documents(UID).count({ filters: params.filters });
    return {
      data: results,
      meta: paginationMeta(ctx.query, total, params.limit),
    };
  },

  async findOne(ctx: Context) {
    const { id } = ctx.params;
    const { populate } = ctx.query as any;
    const params: any = { documentId: id };
    if (populate === '*') {
      params.populate = '*';
    } else if (populate) {
      params.populate = populate;
    }
    const result = await strapi.documents(UID).findOne(params);
    if (!result) return ctx.notFound('Issue not found');
    return { data: result };
  },

  async create(ctx: Context) {
    const { title, description, status, priority, reportedBy, project } =
      ctx.request.body?.data || {};

    if (!title) return ctx.badRequest('title is required');

    const data: any = {
      title,
      description,
      status: status || 'open',
      priority: priority || 'none',
      reportedBy,
    };

    // Attach project from API key context or from request body
    if (ctx.state.forgeProject) {
      data.project = ctx.state.forgeProject.documentId;
    } else if (project) {
      data.project = project;
    }

    const result = await strapi.documents(UID).create({ data });
    ctx.status = 201;
    return { data: result };
  },

  async update(ctx: Context) {
    const { id } = ctx.params;
    const data = ctx.request.body?.data || {};
    const result = await strapi.documents(UID).update({ documentId: id, data });
    if (!result) return ctx.notFound('Issue not found');
    return { data: result };
  },

  async delete(ctx: Context) {
    const { id } = ctx.params;
    const result = await strapi.documents(UID).delete({ documentId: id });
    if (!result) return ctx.notFound('Issue not found');
    return { data: result };
  },

  async enrich(ctx: Context) {
    const { id } = ctx.params;

    const issue = await strapi.documents(UID).findOne({
      documentId: id,
      populate: ['project'],
    });

    if (!issue) return ctx.notFound('Issue not found');
    if (!issue.project) return ctx.badRequest('Issue has no project');

    // Fire and forget — enrichIssue manages status transitions and broadcasts
    setImmediate(() => {
      enrichIssue(strapi, id).catch((err) => {
        strapi.log.error(`Enrichment failed for issue ${id}: ${err}`);
      });
    });

    return { data: { documentId: id, status: 'processing' } };
  },
}));
