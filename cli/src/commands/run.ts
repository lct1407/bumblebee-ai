import { Command } from "commander";
import chalk from "chalk";
import { api, projectSlug } from "../api-client.js";

export function runCommands(): Command {
  const cmd = new Command("run").description("Trigger / inspect workflow runs");

  cmd.command("trigger <number>")
    .description("Trigger workflow for an issue")
    .option("-w, --workflow <name>", "workflow name (default: simple-fix-flow)")
    .action(async (number, opts) => {
      const slug = projectSlug();
      // Resolve issue number → id
      const { data: issue } = await api().get(`/api/projects/${slug}/issues/${number}`);
      const { data } = await api().post("/api/workflow-runs/trigger", {
        issue_id: issue.id,
        workflow_name: opts.workflow,
      });
      console.log(chalk.green(`✓ triggered run ${data.workflow_run_id}`));
      console.log(chalk.gray(`workflow=${data.workflow_name} status=${data.status}`));
    });

  cmd.command("show <runId>")
    .description("Show run detail")
    .action(async (runId) => {
      const { data } = await api().get(`/api/workflow-runs/${runId}`);
      console.log(JSON.stringify(data, null, 2));
    });

  return cmd;
}
