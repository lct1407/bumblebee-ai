/**
 * daemon-cmd.js — `bb daemon` command.
 * Thin wrapper that resolves config path and delegates to daemon.js.
 */
import { homedir } from 'os';
import { join } from 'path';
import { runDaemon } from '../daemon/daemon.js';

export function registerDaemon(program) {
  program
    .command('daemon')
    .description('Start worker daemon: long-poll server for tasks and execute them locally')
    .option('--server <url>', 'Server base URL')
    .option('--config <path>', 'Node config file path', '~/.bumblebee/node.json')
    .option('--interval <seconds>', 'Poll interval in seconds', '3')
    .action(async (opts) => {
      const configPath = opts.config.replace(/^~/, homedir());
      const pollInterval = parseFloat(opts.interval);
      if (isNaN(pollInterval) || pollInterval <= 0) {
        console.error('--interval must be a positive number');
        process.exitCode = 1; return;
      }
      await runDaemon(configPath, opts.server ?? null, pollInterval);
    });
}
