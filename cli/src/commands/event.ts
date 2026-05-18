import { Command } from "commander";
import chalk from "chalk";
import { api, projectSlug } from "../api-client.js";

export function eventCommands(): Command {
  const cmd = new Command("event").description("Read event log");

  cmd.command("list")
    .description("List recent events")
    .option("--issue <id>", "filter by issue id")
    .option("--session <id>", "filter by session id")
    .option("--type <type>", "filter by event type")
    .option("-n, --limit <n>", "max records", "30")
    .action(async (opts) => {
      const params = new URLSearchParams();
      if (opts.issue) params.set("issue_id", opts.issue);
      if (opts.session) params.set("session_id", opts.session);
      if (opts.type) params.set("type", opts.type);
      params.set("limit", opts.limit);
      const { data } = await api().get(`/api/events?${params.toString()}`);
      for (const e of data.reverse()) {
        console.log(
          `${chalk.gray(new Date(e.occurred_at).toISOString())} ${chalk.cyan(e.type)} ` +
            `${chalk.gray(`src=${e.source}`)} ${e.actor ? chalk.gray(`actor=${e.actor}`) : ""}`,
        );
      }
    });

  return cmd;
}
