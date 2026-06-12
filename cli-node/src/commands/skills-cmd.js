/**
 * skills-cmd.js — `bb skills install` and `bb skills targets` commands.
 * Reads bundled cli-node/prompts/*.yaml, writes role prompt files into the
 * target repo using the same layout as bumblebee/installer/bundler.py.
 */
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, '../../prompts');

// ---------------------------------------------------------------------------
// YAML mini-parser — only needs to extract top-level scalar fields from the
// role YAML files (name, display_name, description, system, tools_allowed,
// budgets). No nested sequences beyond simple list values needed.
// Using js-yaml would require a dependency; we avoid it with a small parser
// that covers the exact shape of bumblebee/prompts/*.yaml files.
// ---------------------------------------------------------------------------

function parseRoleYaml(text) {
  const result = {};
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Top-level key: value
    const scalarMatch = line.match(/^(\w+):\s*(.+)$/);
    const blockMatch = line.match(/^(\w+):\s*\|/);
    const listKeyMatch = line.match(/^(\w+):\s*$/);

    if (blockMatch) {
      // Block scalar — collect indented lines
      const key = blockMatch[1];
      i++;
      const blockLines = [];
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
        blockLines.push(lines[i].startsWith('  ') ? lines[i].slice(2) : '');
        i++;
      }
      result[key] = blockLines.join('\n').trimEnd();
    } else if (listKeyMatch) {
      const key = listKeyMatch[1];
      i++;
      const items = [];
      while (i < lines.length && lines[i].match(/^  - /)) {
        items.push(lines[i].slice(4).trim());
        i++;
      }
      if (items.length > 0) result[key] = items;
      // else skip (might be a nested object key we don't need)
    } else if (scalarMatch) {
      result[scalarMatch[1]] = scalarMatch[2].trim();
      i++;
    } else {
      i++;
    }
  }
  return result;
}

function allRoles() {
  return readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .sort();
}

function loadRole(role) {
  const text = readFileSync(join(PROMPTS_DIR, `${role}.yaml`), 'utf8');
  return parseRoleYaml(text);
}

function roleToMarkdown(role, spec) {
  const name = spec.display_name || spec.name || role;
  const description = spec.description || '';
  const system = spec.system || '';
  const tools = Array.isArray(spec.tools_allowed) ? spec.tools_allowed : [];
  const budgets = spec.budgets || {};

  const parts = [
    `# Bumblebee role: ${name}`,
    '',
    `_Role key: \`${role}\`_`,
    '',
    '## Purpose',
    description,
    '',
    '## System prompt',
    '```',
    system.trim(),
    '```',
  ];
  if (tools.length) {
    parts.push('', '## Allowed tools', ...tools.map((t) => `- ${t}`));
  }
  if (typeof budgets === 'object' && Object.keys(budgets).length) {
    parts.push('', '## Budgets',
      ...Object.entries(budgets).map(([k, v]) => `- ${k}: ${v}`));
  }
  parts.push(
    '',
    '## How to use this in an AI coding assistant',
    `Cite this file when asked to act as the Bumblebee \`${role}\` role. ` +
    'Follow the system prompt verbatim; respect the budgets above; ' +
    'limit tool usage to the allowed list.',
  );
  return parts.join('\n') + '\n';
}

function writeFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Target installers — mirrors bumblebee/installer/bundler.py
// ---------------------------------------------------------------------------

const BUNDLE_HEADER = '<!-- bumblebee-bundle:start -->';
const BUNDLE_FOOTER = '<!-- bumblebee-bundle:end -->';

function installClaudeCode(repo) {
  const written = [];
  const roles = allRoles();

  for (const role of roles) {
    const spec = loadRole(role);
    const md = roleToMarkdown(role, spec);
    const p = join(repo, '.claude', 'agents', `bumblebee-${role}.md`);
    writeFile(p, md);
    written.push(p);
  }

  const skillMd = join(repo, '.claude', 'skills', 'bumblebee', 'SKILL.md');
  const skillBody =
    '# Bumblebee role library\n\n' +
    'Role prompts copied from the Bumblebee multi-agent platform ' +
    '(https://github.com/lct1407/bumblebee-ai). Use these when asked to ' +
    'act as a Triager / Implementer / Reviewer / etc.\n\n' +
    '## Roles available\n\n' +
    roles.map((r) => `- \`bumblebee-${r}\` → see ../../agents/bumblebee-${r}.md`).join('\n') +
    '\n';
  writeFile(skillMd, skillBody);
  written.push(skillMd);
  return written;
}

function installCursor(repo) {
  const written = [];
  for (const role of allRoles()) {
    const spec = loadRole(role);
    const body =
      '---\n' +
      `description: Bumblebee ${role} role — see role markdown for full system prompt.\n` +
      'globs: ["**/*"]\n' +
      'alwaysApply: false\n' +
      '---\n\n' +
      roleToMarkdown(role, spec);
    const p = join(repo, '.cursor', 'rules', `bumblebee-${role}.mdc`);
    writeFile(p, body);
    written.push(p);
  }
  return written;
}

function installCodex(repo) {
  const target = join(repo, 'AGENTS.md');
  const block = [BUNDLE_HEADER, '', '## Bumblebee role library', ''];
  for (const role of allRoles()) {
    const spec = loadRole(role);
    const name = spec.display_name || role;
    const desc = (spec.description || '').trim();
    block.push(`### ${name} (\`${role}\`)`);
    block.push(desc);
    block.push('');
    block.push('```');
    block.push((spec.system || '').trim());
    block.push('```');
    block.push('');
  }
  block.push(BUNDLE_FOOTER);
  const insert = block.join('\n');

  const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
  let newContent;
  if (existing.includes(BUNDLE_HEADER) && existing.includes(BUNDLE_FOOTER)) {
    const before = existing.slice(0, existing.indexOf(BUNDLE_HEADER));
    const after = existing.slice(existing.indexOf(BUNDLE_FOOTER) + BUNDLE_FOOTER.length);
    newContent = before.trimEnd() + '\n\n' + insert + '\n' + after.trimStart();
  } else {
    newContent = existing.trimEnd() + '\n\n' + insert + '\n';
  }
  writeFile(target, newContent);
  return [target];
}

function installGeneric(repo) {
  const written = [];
  for (const role of allRoles()) {
    const spec = loadRole(role);
    const p = join(repo, '.bumblebee', 'agents', `${role}.md`);
    writeFile(p, roleToMarkdown(role, spec));
    written.push(p);
  }
  return written;
}

const TARGETS = {
  'claude-code': { label: 'Claude Code (.claude/agents)', install: installClaudeCode },
  'cursor':      { label: 'Cursor IDE (.cursor/rules)',   install: installCursor },
  'codex':       { label: 'OpenAI Codex (AGENTS.md)',     install: installCodex },
  'generic':     { label: 'Vendor-neutral (.bumblebee/)', install: installGeneric },
};

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerSkills(program) {
  const skills = program
    .command('skills')
    .description('Bundle Bumblebee roles for external AI agents');

  skills
    .command('targets')
    .description('List available install targets')
    .action(() => {
      console.log('Bumblebee bundle targets:\n');
      console.log('  key          description');
      console.log('  -----------  -----------------------------------------');
      for (const [key, t] of Object.entries(TARGETS)) {
        console.log(`  ${key.padEnd(12)} ${t.label}`);
      }
    });

  skills
    .command('install')
    .description('Install Bumblebee role prompts into an external AI agent toolchain')
    .option('-t, --target <target>', 'claude-code | cursor | codex | generic', 'claude-code')
    .option('-r, --repo <path>', 'Repo to install into', '.')
    .action((opts) => {
      if (!TARGETS[opts.target]) {
        console.error(`Unknown target: ${opts.target}. Choices: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(2);
      }
      const repoPath = resolve(opts.repo);
      if (!existsSync(repoPath)) {
        console.error(`Repo path does not exist: ${repoPath}`);
        process.exit(1);
      }

      let written;
      try {
        written = TARGETS[opts.target].install(repoPath);
      } catch (err) {
        console.error(`Install failed: ${err.message}`);
        process.exit(1);
      }

      console.log(`Installed ${written.length} file(s) for target ${opts.target}:`);
      written.forEach((p) => console.log(`  - ${p}`));
    });
}
