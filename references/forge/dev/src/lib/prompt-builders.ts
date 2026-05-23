import type { Task, Issue } from "./types";

export function buildIssuePrompt(issue: Issue): string {
  return `/forge-issue ${issue.documentId}`;
}

export function buildMultiIssuePrompt(issues: Issue[]): string {
  const ids = issues.map((i) => i.documentId).join(" ");
  return `/forge-issue ${ids}`;
}

export function buildTaskPrompt(task: Task): string {
  const issueId = task.issue?.documentId;
  if (issueId) {
    return `/forge-issue ${issueId}\n\nFocus on task: ${task.title} (${task.documentId})`;
  }
  return `Work on task: ${task.title}\n\n${task.description ?? ""}\n\nTask DocumentId: ${task.documentId}`;
}
