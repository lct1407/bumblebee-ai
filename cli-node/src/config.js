/**
 * config.js — read/write ~/.bumblebee/cli.json and node.json.
 * Schema is identical to the Python CLI so both tools share the same files.
 *
 * cli.json fields:  { server_url, access_token, username, workspace }
 * node.json fields: { server_url, node_id, node_token, status, pairing_code }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const BB_DIR = join(homedir(), '.bumblebee');

export function bbDir() {
  return BB_DIR;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// CLI config (auth / server)
// ---------------------------------------------------------------------------

export function cliConfigPath() {
  return join(BB_DIR, 'cli.json');
}

/** Read ~/.bumblebee/cli.json. Returns {} if missing or unreadable. */
export function readCliConfig() {
  const p = cliConfigPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/** Write (overwrite) ~/.bumblebee/cli.json atomically. */
export function writeCliConfig(data) {
  ensureDir(BB_DIR);
  writeFileSync(cliConfigPath(), JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Node config (daemon / device)
// ---------------------------------------------------------------------------

export function nodeConfigPath(customPath) {
  if (customPath) return customPath.replace(/^~/, homedir());
  return join(BB_DIR, 'node.json');
}

/** Read node config. Returns {} if missing or unreadable. */
export function readNodeConfig(customPath) {
  const p = nodeConfigPath(customPath);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/** Write (merge) node config. */
export function writeNodeConfig(data, customPath) {
  const p = nodeConfigPath(customPath);
  ensureDir(join(p, '..'));
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Server URL resolution (all commands)
// Priority: --server flag > BB_SERVER_URL env > config file > cloud default
// ---------------------------------------------------------------------------

const DEFAULT_SERVER = 'https://bb-api.hubapi.cc';

export function resolveServerUrl(flagValue, configServerUrl) {
  return (
    flagValue ||
    process.env.BB_SERVER_URL ||
    configServerUrl ||
    DEFAULT_SERVER
  );
}
