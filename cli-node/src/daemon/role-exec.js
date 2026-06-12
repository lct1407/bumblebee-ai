/**
 * role-exec.js — execute a `role_exec` task kind.
 * Mirrors bumblebee/worker/daemon.py _execute_role_exec() + _extract_diff() + _apply_diff().
 *
 * Spawns `claude --print --output-format=json` with the role prompt via stdin,
 * parses JSON output, optionally extracts a ```diff block and runs `git apply`.
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { which } from './which.js';

/** Extract a unified diff from a ```diff fenced block or raw `diff --git` text. */
function extractDiff(text) {
  const fenced = text.match(/```(?:diff|patch)?\n(diff --git[\s\S]*?)\n```/);
  if (fenced) return fenced[1];
  const idx = text.indexOf('diff --git');
  if (idx !== -1) return text.slice(idx);
  return null;
}

/** Run `git apply` with diff piped to stdin. Returns true on success. */
async function applyDiff(repoPath, diff, report) {
  return new Promise((resolve) => {
    const proc = spawn('git', ['apply', '--whitespace=nowarn', '-'], {
      cwd: repoPath,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', async (code) => {
      if (code !== 0) {
        await report('git_apply_failed', { stderr: stderr.slice(0, 500) });
        resolve(false);
      } else {
        resolve(true);
      }
    });
    proc.on('error', async (err) => {
      await report('git_apply_exception', { error: err.message.slice(0, 300) });
      resolve(false);
    });
    proc.stdin.write(diff, 'utf8');
    proc.stdin.end();
  });
}

/** Run `claude --print --output-format=json` with prompt on stdin. */
function runClaude(repoPath, prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--output-format=json'], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', reject);
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
  });
}

/**
 * Execute a role_exec payload.
 * @param {Function} report  async (eventType, body) => void
 * @param {object}   payload task payload
 * @returns {Promise<boolean>} success
 */
export async function executeRoleExec(report, payload) {
  const role = payload.role ?? 'implementer';
  const repoPath = payload.repo_path;

  if (!repoPath || !existsSync(repoPath)) {
    await report('role_exec_skip', { reason: `repo_path not found: ${repoPath}` });
    return false;
  }

  const userMsg = payload.user_message ?? '';
  if (!userMsg) {
    await report('role_exec_skip', { reason: 'no user_message' });
    return false;
  }

  if (!which('claude')) {
    await report('role_exec_skip', { reason: 'claude CLI not found in PATH' });
    return false;
  }

  await report('role_exec_started', { role, cwd: repoPath });

  const system = payload.system_prompt ?? '';
  const fullPrompt = system ? `<system>${system}</system>\n\n${userMsg}` : userMsg;

  let result;
  try {
    result = await runClaude(repoPath, fullPrompt);
  } catch (err) {
    await report('role_exec_exception', { error: err.message.slice(0, 500) });
    return false;
  }

  if (result.code !== 0) {
    await report('role_exec_failed', {
      rc: result.code,
      stderr: result.stderr.slice(0, 1000),
    });
    return false;
  }

  let resultText;
  try {
    const parsed = JSON.parse(result.stdout);
    resultText = parsed.result ?? parsed.text ?? result.stdout;
  } catch {
    resultText = result.stdout;
  }

  await report('role_exec_output', { text: resultText.slice(0, 4000), size: resultText.length });

  if (payload.apply_diff && role === 'implementer') {
    const diff = extractDiff(resultText);
    if (diff) {
      const applied = await applyDiff(repoPath, diff, report);
      await report('git_apply_result', { applied });
    }
  }

  await report('role_exec_completed', { role });
  return true;
}
