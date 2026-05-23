import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: {
      // Ingest CLI usage from ~/.claude every 10 minutes
      '*/10 * * * *': async ({ strapi }: { strapi: Core.Strapi }) => {
        try {
          const { ingestCliUsage } = await import('../src/services/cli-ingestion');
          const result = await ingestCliUsage(strapi);
          if (result.ingested > 0) {
            strapi.log.info(`CLI ingestion: ${result.ingested} new sessions from ${result.scanned} files`);
          }
        } catch (err) {
          strapi.log.error(`CLI ingestion cron error: ${err}`);
        }
      },
      // PO Agent scheduled reviews — check daily at 9 AM UTC
      '0 9 * * *': async ({ strapi }: { strapi: Core.Strapi }) => {
        try {
          const { triggerScheduledPoReviews } = await import('../src/services/po-agent-cron');
          await triggerScheduledPoReviews(strapi);
        } catch (err) {
          strapi.log.error(`PO Agent cron error: ${err}`);
        }
      },
    },
  },
});

export default config;
