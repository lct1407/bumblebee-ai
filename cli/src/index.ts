#!/usr/bin/env node
/**
 * bb — Bumblebee v3 CLI entry point.
 *
 * Commands:
 *   bb issue create <title>      Create an issue
 *   bb issue list                List issues
 *   bb issue show <number>       Show issue detail
 *   bb run trigger <number>      Trigger workflow run
 *   bb chat send <text>          Send chat message (Tier 2)
 *   bb event list --issue=X      Tail event log
 */
import { Command } from "commander";
import { issueCommands } from "./commands/issue.js";
import { runCommands } from "./commands/run.js";
import { chatCommands } from "./commands/chat.js";
import { eventCommands } from "./commands/event.js";

const program = new Command();
program
  .name("bb")
  .description("Bumblebee v3 CLI — multi-agent task management")
  .version("0.3.0");

program.addCommand(issueCommands());
program.addCommand(runCommands());
program.addCommand(chatCommands());
program.addCommand(eventCommands());

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
