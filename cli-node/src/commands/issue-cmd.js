/**
 * issue-cmd.js — `bb issue list` and `bb issue create` commands.
 * Same GraphQL queries as bumblebee/cli.py issue_list / issue_create.
 */
import { gql, gqlEndpoint } from '../api.js';
import { readCliConfig, resolveServerUrl } from '../config.js';

const PROJECTS_QUERY = `{ projects { id slug } }`;

const ISSUES_QUERY = `
  query($pid: UUID!, $status: String) {
    issues(projectId: $pid, status: $status, limit: 100) {
      number status title complexity
    }
  }
`;

const CREATE_MUTATION = `
  mutation($i: IssueCreateInput!) {
    createIssue(input: $i) { number title status }
  }
`;

/** Minimal fixed-width table — no external deps. */
function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
  const fmt = (row) => row.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ');
  console.log(fmt(headers));
  console.log(sep);
  rows.forEach((r) => console.log(fmt(r)));
}

async function resolveProjectId(endpoint, token, slug) {
  const data = await gql(endpoint, PROJECTS_QUERY, {}, token);
  const proj = (data.projects ?? []).find((p) => p.slug === slug);
  return proj?.id ?? null;
}

export function registerIssue(program) {
  const issue = program
    .command('issue')
    .description('Issue commands');

  issue
    .command('list')
    .description('List issues (via GraphQL)')
    .option('-p, --project <slug>', 'Project slug', 'bb')
    .option('--status <status>', 'Filter by status')
    .option('--server <url>', 'Server base URL')
    .action(async (opts) => {
      const cfg = readCliConfig();
      const serverUrl = resolveServerUrl(opts.server, cfg.server_url);
      const token = process.env.BUMBLEBEE_TOKEN || cfg.access_token;
      if (!token) {
        console.error('Not logged in. Run `bb login <username>` first.');
        process.exitCode = 1; return;
      }

      const endpoint = gqlEndpoint(serverUrl);
      let pid;
      try {
        pid = await resolveProjectId(endpoint, token, opts.project);
      } catch (err) {
        console.error(`Failed to fetch projects: ${err.message}`);
        process.exitCode = 1; return;
      }
      if (!pid) {
        console.error(`Project not found: ${opts.project}`);
        process.exitCode = 1; return;
      }

      let data;
      try {
        data = await gql(endpoint, ISSUES_QUERY, { pid, status: opts.status ?? null }, token);
      } catch (err) {
        console.error(`Failed to list issues: ${err.message}`);
        process.exitCode = 1; return;
      }

      const issues = data.issues ?? [];
      if (issues.length === 0) {
        console.log('No issues found.');
        return;
      }
      printTable(
        ['Key', 'Status', 'Cx', 'Title'],
        issues.map((i) => [
          `BB-${i.number}`,
          i.status,
          i.complexity ?? '-',
          (i.title ?? '').slice(0, 60),
        ])
      );
    });

  issue
    .command('create <title>')
    .description('Create an issue (via GraphQL)')
    .option('-p, --project <slug>', 'Project slug', 'bb')
    .option('-t, --type <type>', 'Issue type', 'TASK')
    .option('--priority <priority>', 'Priority', 'MEDIUM')
    .option('--server <url>', 'Server base URL')
    .action(async (title, opts) => {
      const cfg = readCliConfig();
      const serverUrl = resolveServerUrl(opts.server, cfg.server_url);
      const token = process.env.BUMBLEBEE_TOKEN || cfg.access_token;
      if (!token) {
        console.error('Not logged in. Run `bb login <username>` first.');
        process.exitCode = 1; return;
      }

      const endpoint = gqlEndpoint(serverUrl);
      let pid;
      try {
        pid = await resolveProjectId(endpoint, token, opts.project);
      } catch (err) {
        console.error(`Failed to fetch projects: ${err.message}`);
        process.exitCode = 1; return;
      }
      if (!pid) {
        console.error(`Project not found: ${opts.project}`);
        process.exitCode = 1; return;
      }

      let data;
      try {
        data = await gql(endpoint, CREATE_MUTATION, {
          i: {
            projectId: pid,
            title,
            type: opts.type.toUpperCase(),
            priority: opts.priority.toUpperCase(),
          },
        }, token);
      } catch (err) {
        console.error(`Failed to create issue: ${err.message}`);
        process.exitCode = 1; return;
      }

      const d = data.createIssue;
      console.log(`Created BB-${d.number}: ${d.title} (status=${d.status})`);
    });
}
