/**
 * device-cmd.js — `bb device pair` and `bb device save-token` commands.
 * Parity with bumblebee/cli.py device_pair / device_save_token.
 */
import { hostname } from 'os';
import { post } from '../api.js';
import { readNodeConfig, writeNodeConfig, resolveServerUrl } from '../config.js';

export function registerDevice(program) {
  const device = program
    .command('device')
    .description('Device pairing for worker daemon');

  device
    .command('pair')
    .description('Request pairing; print code; write stub ~/.bumblebee/node.json')
    .option('--server <url>', 'Server base URL')
    .option('--name <name>', 'Device label (default: hostname)')
    .option('--workspace <slug>', 'Workspace slug')
    .option('--config <path>', 'Config file path', '~/.bumblebee/node.json')
    .action(async (opts) => {
      const serverUrl = resolveServerUrl(opts.server, null);
      const deviceName = opts.name || hostname();

      const body = {
        name: deviceName,
        capabilities: ['claude-cli', 'git'],
        hostname: hostname(),
        platform: process.platform,
        workspace_slug: opts.workspace ?? null,
      };

      let data;
      try {
        data = await post(`${serverUrl}/api/devices/pair-request`, body);
      } catch (err) {
        console.error(`Pair request failed: ${err.message}`);
        process.exitCode = 1; return;
      }

      const code = data.pairing_code;
      const nodeId = data.node_id;
      const webUrl = serverUrl.replace(/:\d+$/, ':3000');

      console.log(`\nPairing code:  ${code}`);
      console.log(`Open ${webUrl}/settings/devices and confirm this code (10 min).`);
      console.log(`Node ID: ${nodeId}\n`);
      console.log('Waiting for confirmation... (run `bb device save-token <token>` after confirming in web)');

      writeNodeConfig(
        { server_url: serverUrl, node_id: nodeId, status: 'pending', pairing_code: code },
        opts.config
      );
      console.log(`Stub config written. Run \`bb device save-token <token>\` after confirming.`);
    });

  device
    .command('save-token <token>')
    .description('Merge node_token + status=active into node.json')
    .option('--config <path>', 'Config file path', '~/.bumblebee/node.json')
    .action((token, opts) => {
      const existing = readNodeConfig(opts.config);
      const updated = { ...existing, node_token: token, status: 'active' };
      writeNodeConfig(updated, opts.config);
      console.log(`Token saved at ${opts.config}`);
    });
}
