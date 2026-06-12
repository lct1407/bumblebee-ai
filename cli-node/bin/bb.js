#!/usr/bin/env node
/**
 * bb — Bumblebee AI CLI entry point.
 * Bootstraps Commander program and registers all subcommand groups.
 */
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { registerVersion } from '../src/commands/version-cmd.js';
import { registerLogin } from '../src/commands/login-cmd.js';
import { registerWhoami } from '../src/commands/whoami-cmd.js';
import { registerIssue } from '../src/commands/issue-cmd.js';
import { registerDevice } from '../src/commands/device-cmd.js';
import { registerSkills } from '../src/commands/skills-cmd.js';
import { registerDaemon } from '../src/commands/daemon-cmd.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('bb')
  .description('Bumblebee AI — multi-agent task management platform')
  .version(pkg.version, '-V, --version-flag', 'output version number');

registerVersion(program, pkg.version);
registerLogin(program);
registerWhoami(program);
registerIssue(program);
registerDevice(program);
registerSkills(program);
registerDaemon(program);

program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
