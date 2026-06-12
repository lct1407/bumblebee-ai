/**
 * version-cmd.js — `bb version` command.
 */

export function registerVersion(program, version) {
  program
    .command('version')
    .description('Print bumblebee-ai version')
    .action(() => {
      console.log(`bumblebee-ai ${version}`);
    });
}
