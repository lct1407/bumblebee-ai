/**
 * whoami-cmd.js — `bb whoami` command.
 * Queries GraphQL `me` and prints workspace info.
 */
import { gql, gqlEndpoint } from '../api.js';
import { readCliConfig, resolveServerUrl } from '../config.js';

const ME_QUERY = `
  { me { id name slug plan paymentOverdue } }
`;

export function registerWhoami(program) {
  program
    .command('whoami')
    .description('Print current workspace (via GraphQL me query)')
    .option('--server <url>', 'Server base URL')
    .action(async (opts) => {
      const cfg = readCliConfig();
      const serverUrl = resolveServerUrl(opts.server, cfg.server_url);
      const token = process.env.BUMBLEBEE_TOKEN || cfg.access_token;

      if (!token) {
        console.error('Not logged in. Run `bb login <username>` first.');
        process.exitCode = 1; return;
      }

      let data;
      try {
        data = await gql(gqlEndpoint(serverUrl), ME_QUERY, {}, token);
      } catch (err) {
        console.error(`whoami failed: ${err.message}`);
        process.exitCode = 1; return;
      }

      if (!data.me) {
        console.error('No workspace bound to current token.');
        process.exitCode = 1; return;
      }

      const me = data.me;
      console.log(`workspace: ${me.name} (${me.slug})`);
      console.log(`  id:      ${me.id}`);
      console.log(`  plan:    ${me.plan}`);
      console.log(`  overdue: ${me.paymentOverdue}`);
    });
}
