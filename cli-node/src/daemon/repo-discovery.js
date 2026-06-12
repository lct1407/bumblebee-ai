/**
 * repo-discovery.js — scan filesystem for git repos.
 * Mirrors bumblebee/worker/daemon.py _discover_repos().
 *
 * Returns [{path, remote, branch}, ...] scanning BB_WORKER_REPOS env
 * (colon-separated) or ~/code, ~/src, ~/Source by default.
 */
import { execFileSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, sep } from 'path';

const MAX_DEPTH = 3;
const MAX_REPOS = 50;

function defaultRoots() {
  const env = process.env.BB_WORKER_REPOS;
  if (env) {
    const roots = env.split(':').filter(Boolean);
    if (roots.length) return roots;
  }
  const home = homedir();
  return [join(home, 'code'), join(home, 'src'), join(home, 'Source')];
}

function gitCmd(repoPath, ...args) {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Recursively find .git dirs up to maxDepth below root. */
function findGitDirs(dir, depth, results) {
  if (depth > MAX_DEPTH || results.length >= MAX_REPOS) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (results.length >= MAX_REPOS) break;
    if (ent.name === '.git' && ent.isDirectory()) {
      results.push(dir);
      return; // don't recurse into a git repo
    }
    if (ent.isDirectory() && !ent.name.startsWith('.')) {
      findGitDirs(join(dir, ent.name), depth + 1, results);
    }
  }
}

export function discoverRepos(searchRoots) {
  const roots = searchRoots ?? defaultRoots();
  const found = [];
  const seen = new Set();

  for (const root of roots) {
    if (!existsSync(root)) continue;
    const repoPaths = [];
    findGitDirs(root, 0, repoPaths);
    for (const repoPath of repoPaths) {
      if (seen.has(repoPath)) continue;
      seen.add(repoPath);
      const remote = gitCmd(repoPath, 'remote', 'get-url', 'origin');
      const branch = gitCmd(repoPath, 'branch', '--show-current');
      found.push({ path: repoPath, remote, branch });
    }
  }
  return found;
}
