import { Command } from "commander";
import chalk from "chalk";
import { api, projectSlug } from "../api-client.js";

export function chatCommands(): Command {
  const cmd = new Command("chat").description("ChatSession Tier 2 — Q&A + suggest");

  cmd.command("start")
    .description("Start a new chat session")
    .option("-t, --title <title>")
    .action(async (opts) => {
      const slug = projectSlug();
      const { data } = await api().post(`/api/projects/${slug}/chat/sessions`, {
        title: opts.title,
        source: "cli",
      });
      console.log(chalk.green(`✓ chat session: ${data.id}`));
      console.log(chalk.gray("send a message with: bb chat send <session_id> <text>"));
    });

  cmd.command("send <sessionId> <text...>")
    .description("Send a message")
    .action(async (sessionId, text) => {
      const slug = projectSlug();
      const content = (Array.isArray(text) ? text.join(" ") : text) as string;
      const { data } = await api().post(
        `/api/projects/${slug}/chat/sessions/${sessionId}/messages`,
        { content },
      );
      console.log(chalk.cyan("Assistant:"), data.reply);
    });

  return cmd;
}
