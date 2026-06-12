/**
 * task-exec.js — execute a single claimed task.
 * Mirrors bumblebee/worker/daemon.py _execute_task().
 *
 * Supported task kinds:
 *   shell     — run payload.command in a shell, stream stdout lines as task_log events
 *   role_exec — spawn claude --print, parse JSON, optionally git apply diff
 */
import { spawn } from 'child_process';
import { hostname } from 'os';
import { existsSync } from 'fs';
import { executeRoleExec } from './role-exec.js';
import { post } from '../api.js';

/**
 * @param {object} client  { serverUrl, token } — connection context
 * @param {object} task    claimed task from /api/tasks/claim
 */
export async function executeTask(client, task) {
  const { serverUrl, token } = client;
  const taskId = task.task_id;
  const payload = task.payload ?? {};
  const issueId = task.issue_id ?? null;
  const kind = payload.command_kind ?? 'shell';

  console.log(`[daemon] executing task ${taskId} kind=${kind} issue=${issueId}`);

  async function report(eventType, body) {
    try {
      await post(
        `${serverUrl}/api/tasks/${taskId}/report`,
        { type: eventType, payload: body, issue_id: issueId },
        token,
        10_000,
      );
    } catch (err) {
      console.warn(`[daemon] report failed (${eventType}): ${err.message}`);
    }
  }

  async function ack(success, reason = '') {
    const endpoint = success ? 'ack' : 'fail';
    const params = !success && reason ? `?reason=${encodeURIComponent(reason)}` : '';
    try {
      await post(
        `${serverUrl}/api/tasks/${taskId}/${endpoint}${params}`,
        {},
        token,
        10_000,
      );
    } catch (err) {
      console.warn(`[daemon] ack/fail failed: ${err.message}`);
    }
  }

  await report('task_started', { node_hostname: hostname(), kind });

  if (kind === 'role_exec') {
    const ok = await executeRoleExec(report, payload);
    await ack(ok, ok ? 'role_exec' : 'role_exec_failed');
    return ok;
  }

  // ---- shell kind ----
  const cmd = payload.command;
  const repoPath = payload.repo_path;
  const cwd = repoPath && existsSync(repoPath) ? repoPath : process.cwd();

  if (!cmd) {
    await report('task_no_command', { reason: "payload missing 'command'" });
    await ack(false, 'no_command');
    return false;
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, [], { cwd, shell: true, stdio: ['ignore', 'pipe', 'stdout'] });
    proc.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed) await report('task_log', { line: trimmed });
      }
    });
    proc.on('close', async (code) => {
      const ok = code === 0;
      await report(ok ? 'task_completed' : 'task_failed', { return_code: code });
      await ack(ok, `rc=${code}`);
      resolve(ok);
    });
    proc.on('error', async (err) => {
      await report('task_exception', { error: err.message.slice(0, 500) });
      await ack(false, err.message.slice(0, 200));
      resolve(false);
    });
  });
}
