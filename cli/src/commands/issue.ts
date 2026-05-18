import { Command } from "commander";
import chalk from "chalk";
import { api, projectSlug } from "../api-client.js";

export function issueCommands(): Command {
  const cmd = new Command("issue").description("Manage issues");

  cmd.command("list")
    .description("List issues")
    .option("--status <status>", "filter by status")
    .action(async (opts) => {
      const slug = projectSlug();
      const url = `/api/projects/${slug}/issues${opts.status ? `?status=${opts.status}` : ""}`;
      const { data } = await api().get(url);
      for (const issue of data) {
        console.log(
          `${chalk.cyan(`BB-${issue.number}`)} ${chalk.gray(`[${issue.status}]`)} ${issue.title}`,
        );
      }
    });

  cmd.command("create <title>")
    .description("Create a new issue")
    .option("-d, --description <text>", "issue description")
    .option("-t, --type <type>", "type: epic|story|task|bug|feature|chore|spike", "task")
    .option("-p, --priority <prio>", "critical|high|medium|low|none", "medium")
    .action(async (title, opts) => {
      const slug = projectSlug();
      const { data } = await api().post(`/api/projects/${slug}/issues`, {
        title,
        description: opts.description,
        type: opts.type,
        priority: opts.priority,
      });
      console.log(chalk.green(`✓ created BB-${data.number}: ${data.title}`));
    });

  cmd.command("show <number>")
    .description("Show issue detail")
    .action(async (number) => {
      const slug = projectSlug();
      const { data } = await api().get(`/api/projects/${slug}/issues/${number}`);
      console.log(chalk.bold(`BB-${data.number}: ${data.title}`));
      console.log(chalk.gray(`status=${data.status} priority=${data.priority} type=${data.type}`));
      if (data.complexity) console.log(chalk.gray(`complexity=${data.complexity}`));
      if (data.ai_confidence != null)
        console.log(chalk.gray(`ai_confidence=${data.ai_confidence}`));
      if (data.description) {
        console.log();
        console.log(data.description);
      }
      if (data.scope_hints?.length) {
        console.log();
        console.log(chalk.gray("scope hints: ") + data.scope_hints.join(", "));
      }
    });

  return cmd;
}
