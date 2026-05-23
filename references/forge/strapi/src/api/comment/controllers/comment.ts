import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { parseQueryParams } from '../../../services/query-params';

const UID = 'api::comment.comment' as const;

export default factories.createCoreController(UID, ({ strapi }) => ({
  async find(ctx: Context) {
    const params = parseQueryParams(ctx.query);
    const results = await strapi.documents(UID).findMany(params);
    return { data: results };
  },

  async create(ctx: Context) {
    const { body, author, isAI, issue } = ctx.request.body?.data || {};

    if (!body) return ctx.badRequest('body is required');

    const data: any = { body, author, isAI };
    if (issue) data.issue = issue;

    const result = await strapi.documents(UID).create({ data });
    ctx.status = 201;
    return { data: result };
  },
}));
