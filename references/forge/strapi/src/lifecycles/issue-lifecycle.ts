import { broadcast } from '../services/websocket';
import { sendWebhook } from '../services/webhook';

const TRACKED_FIELDS = ['status', 'priority', 'title', 'category'] as const;

export function subscribeIssueLifecycles(strapi: any) {
  strapi.db.lifecycles.subscribe({
    models: ['api::issue.issue'],

    async afterCreate(event: any) {
      const { result } = event;
      broadcast('issue:created', { documentId: result.documentId, title: result.title });
    },

    async beforeUpdate(event: any) {
      const id = event.params?.where?.id;
      if (!id) return;

      try {
        const current = await strapi.db.query('api::issue.issue').findOne({
          where: { id },
          select: ['id', 'changeHistory', ...TRACKED_FIELDS],
        });
        event.state = { previous: current };
      } catch (err: any) {
        strapi.log.error(`Issue beforeUpdate: failed to fetch previous state: ${err.message}`);
      }
    },

    async afterUpdate(event: any) {
      const { result } = event as any;
      broadcast('issue:updated', { documentId: result.documentId, status: result.status });

      if (result.status === 'confirmed') {
        broadcast('issue:confirmed', { documentId: result.documentId });
      }

      // Record change history
      const previous = (event.state as any)?.previous;
      if (!previous) return;

      // Skip if this update only touched changeHistory (avoid infinite loop)
      const dataKeys = Object.keys(event.params?.data || {});
      if (dataKeys.length === 1 && dataKeys[0] === 'changeHistory') return;

      const now = new Date().toISOString();
      const reqCtx = strapi.requestContext?.get?.();
      const by = (reqCtx as any)?.state?.user?.username || 'system';

      const newEntries: any[] = [];
      for (const field of TRACKED_FIELDS) {
        if (result[field] !== undefined && String(result[field] ?? '') !== String(previous[field] ?? '')) {
          newEntries.push({
            field,
            from: previous[field] ?? null,
            to: result[field],
            at: now,
            by,
          });
        }
      }

      if (newEntries.length === 0) return;

      const existingHistory = Array.isArray(previous.changeHistory) ? previous.changeHistory : [];
      const updatedHistory = [...existingHistory, ...newEntries].slice(-200);

      try {
        await strapi.db.query('api::issue.issue').update({
          where: { id: result.id },
          data: { changeHistory: updatedHistory },
        });
      } catch (err: any) {
        strapi.log.error(`Issue afterUpdate: failed to persist changeHistory: ${err.message}`);
      }

      // Fire webhook for status changes
      const statusChange = newEntries.find((e) => e.field === 'status');
      if (statusChange) {
        setImmediate(() => {
          sendWebhook(strapi, result.documentId, statusChange).catch((err: any) => {
            strapi.log.error(`Webhook dispatch failed: ${err}`);
          });
        });
      }
    },
  });
}
