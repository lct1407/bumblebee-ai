/**
 * which.js — synchronous PATH lookup for executables.
 * Avoids the `which` npm package; uses Node built-ins only.
 */
import { execFileSync } from 'child_process';

const cache = new Map();

/**
 * Returns the full path to the executable, or null if not found.
 * Result is cached per process lifetime.
 * @param {string} name  e.g. 'claude', 'git', 'docker'
 */
export function which(name) {
  if (cache.has(name)) return cache.get(name);
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, [name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim().split('\n')[0].trim();
    cache.set(name, result || null);
    return result || null;
  } catch {
    cache.set(name, null);
    return null;
  }
}
