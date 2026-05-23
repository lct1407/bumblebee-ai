import { factories } from '@strapi/strapi';
import type { Context } from 'koa';

const UID = 'api::chat-session.chat-session' as const;

/**
 * Custom controller for chat-session.
 *
 * Routes use auth:false + is-forge-project policy, which means
 * Strapi's core controller strips relations from both input and output.
 * Override find/findOne/create to handle relations properly.
 */
export default factories.createCoreController(UID, ({ strapi }) => ({
  async find(ctx: Context) {
    const { populate, filters, sort, pagination } = ctx.query as any;
    const result = await strapi.documents(UID).findMany({
      populate: populate || undefined,
      filters: filters || undefined,
      sort: sort || undefined,
      limit: pagination?.pageSize ? Number(pagination.pageSize) : 25,
      start: pagination?.page ? (Number(pagination.page) - 1) * (Number(pagination.pageSize) || 25) : 0,
    });
    return { data: result };
  },

  async findOne(ctx: Context) {
    const { id } = ctx.params;
    const { populate } = ctx.query as any;
    const result = await strapi.documents(UID).findOne({
      documentId: id,
      populate: populate || undefined,
    });
    if (!result) {
      return ctx.notFound('Chat session not found');
    }
    return { data: result };
  },

  async create(ctx: Context) {
    const { title, messages, source, metadata, project } = ctx.request.body?.data || {};

    const data: any = { title, messages, source, metadata };
    if (project) data.project = project;

    const result = await strapi.documents(UID).create({ data });
    ctx.status = 201;
    return { data: result };
  },
}));
