/**
 * daemon.js — worker daemon main loop.
 * Mirrors bumblebee/worker/daemon.py run_daemon() + _heartbeat_loop() + _detect_capabilities().
 *
 * Connects with node_token, sends heartbeats every 30 s, long-polls
 * /api/tasks/claim, dispatches to task-exec.js, loops until SIGINT/SIGTERM.
 */
import { hostname } from 'os';
import { existsSync, readFileSync } from 'fs';
import { which } from './which.js';
import { discoverRepos } from './repo-discovery.js';
import { executeTask } from './task-exec.js';
import { post } from '../api.js';
import { readNodeConfig, resolveServerUrl } from '../config.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

function detectCapabilities() {
  const caps = [];
  if (which('claude')) caps.push('claude-cli');
  if (which('git')) caps.push('git');
  if (which('docker')) caps.push('docker');
  return caps;
}

async function heartbeatLoop(serverUrl, token, signal) {
  while (!signal.aborted) {
    try {
      await post(
        `${serverUrl}/api/devices/heartbeat`,
        { capabilities: detectCapabilities(), repos_discovered: discoverRepos() },
        token,
        10_000,
      );
    } catch (err) {
      console.warn(`[daemon] heartbeat failed: ${err.message}`);
    }
    // Sleep HEARTBEAT_INTERVAL_MS, but wake early on abort
    await new Promise((resolve) => {
      const t = setTimeout(resolve, HEARTBEAT_INTERVAL_MS);
      signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
}

/**
 * Run the daemon loop until SIGINT/SIGTERM.
 * @param {string} configPath  Path to node.json (expanded)
 * @param {string} serverFlag  --server flag value (may be null)
 * @param {number} pollInterval  Seconds between empty-queue polls
 */
export async function runDaemon(configPath, serverFlag, pollInterval) {
  if (!existsSync(configPath)) {
    console.error(`[daemon] no config at ${configPath} — run \`bb device pair\` first`);
    process.exit(2);
  }

  let cfg;
  try {
    cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`[daemon] failed to read config: ${err.message}`);
    process.exit(2);
  }

  const token = cfg.node_token;
  if (!token || !token.startsWith('nt_')) {
    console.error(`[daemon] config missing valid node_token (status=${cfg.status})`);
    process.exit(2);
  }

  const serverUrl = resolveServerUrl(serverFlag, cfg.server_url);
  const client = { serverUrl, token };
  const pollMs = pollInterval * 1000;

  console.log(`[daemon] starting → server=${serverUrl} node=${cfg.node_id}`);

  const abortCtrl = new AbortController();
  const stop = () => { abortCtrl.abort(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // Start heartbeat in background — errors are logged, never fatal
  heartbeatLoop(serverUrl, token, abortCtrl.signal).catch(() => {});

  while (!abortCtrl.signal.aborted) {
    try {
      const task = await post(
        `${serverUrl}/api/tasks/claim`,
        { capabilities: detectCapabilities() },
        token,
        30_000,
      );

      if (task == null) {
        await sleep(pollMs, abortCtrl.signal);
        continue;
      }

      await executeTask(client, task);
    } catch (err) {
      if (abortCtrl.signal.aborted) break;
      console.error(`[daemon] poll error: ${err.message}`);
      await sleep(pollMs * 2, abortCtrl.signal);
    }
  }

  console.log('[daemon] stopped.');
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}
