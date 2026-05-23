import { factories } from '@strapi/strapi';
import type { Context } from 'koa';
import { find, findOne } from '../handlers/session-crud';
import { start, send, abort } from '../handlers/session-lifecycle';
import { relay, buildPrompt, promptBuilt, registerDesktopHandler, unregisterDesktopHandler, desktopStatus } from '../handlers/desktop-relay';

// Cast UID — Strapi types are generated at build time; this content type is new.
const UID = 'api::agent-session.agent-session' as any;

export default factories.createCoreController(UID, ({ strapi }) => ({
  async find(ctx: Context) { return find(ctx, strapi); },
  async findOne(ctx: Context) { return findOne(ctx, strapi); },
  async start(ctx: Context) { return start(ctx, strapi); },
  async send(ctx: Context) { return send(ctx, strapi); },
  async abort(ctx: Context) { return abort(ctx, strapi); },
  async relay(ctx: Context) { return relay(ctx, strapi); },
  async buildPrompt(ctx: Context) { return buildPrompt(ctx, strapi); },
  async promptBuilt(ctx: Context) { return promptBuilt(ctx, strapi); },
  async registerDesktop(ctx: Context) { return registerDesktopHandler(ctx); },
  async unregisterDesktop(ctx: Context) { return unregisterDesktopHandler(ctx); },
  async desktopStatus(ctx: Context) { return desktopStatus(ctx); },
}));
