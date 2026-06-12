/**
 * login-cmd.js — `bb login <username>` command.
 * Prompts for password (hidden), POSTs GraphQL login mutation,
 * writes ~/.bumblebee/cli.json with token + workspace.
 */
import { createInterface } from 'readline';
import { gql, gqlEndpoint } from '../api.js';
import { writeCliConfig, resolveServerUrl } from '../config.js';

/** Prompt for a password without echoing input to the terminal. */
function promptPassword(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // Mute output so keystrokes are not echoed
    rl.stdoutMuted = true;
    rl._writeToOutput = (str) => {
      // Allow the prompt text itself but swallow typed characters
      if (rl.stdoutMuted && str !== prompt) return;
      rl.output.write(str);
    };
    rl.question(prompt, (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const LOGIN_MUTATION = `
  mutation($i: LoginInput!) {
    login(input: $i) {
      accessToken
      user { username }
      workspace { name slug plan }
    }
  }
`;

export function registerLogin(program) {
  program
    .command('login <username>')
    .description('Login and store token in ~/.bumblebee/cli.json')
    .option('--server <url>', 'Server base URL')
    .option('--config <path>', 'Config file path', '~/.bumblebee/cli.json')
    .action(async (username, opts) => {
      const serverUrl = resolveServerUrl(opts.server, null);
      const endpoint = gqlEndpoint(serverUrl);

      const password = await promptPassword(`Password for ${username}: `);
      if (!password) {
        console.error('Password is required.');
        process.exitCode = 1; return;
      }

      let data;
      try {
        data = await gql(endpoint, LOGIN_MUTATION, {
          i: { username, password },
        });
      } catch (err) {
        console.error(`Login failed: ${err.message}`);
        process.exitCode = 1; return;
      }

      const out = data.login;
      if (!out?.accessToken) {
        console.error('Login failed: no access token returned.');
        process.exitCode = 1; return;
      }

      const cfg = {
        server_url: serverUrl,
        access_token: out.accessToken,
        username: out.user?.username ?? username,
        workspace: out.workspace ?? null,
      };
      writeCliConfig(cfg);

      const wsName = out.workspace?.name ?? 'none';
      console.log(`Logged in as ${cfg.username}, workspace=${wsName}`);
      console.log(`Token cached at ~/.bumblebee/cli.json`);
    });
}
