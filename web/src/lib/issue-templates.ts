/**
 * First-issue templates for the onboarding wizard.
 *
 * Each template pre-fills a meaningful issue body so the user can trigger a
 * workflow immediately without writing markdown. Sections use the schema parsed
 * by `bumblebee/web/lib/issue-sections.ts`.
 */
export interface IssueTemplate {
  id: string;
  title: string;
  type: "bug" | "feature" | "task" | "story" | "chore" | "spike";
  priority: "critical" | "high" | "medium" | "low" | "none";
  icon: string;
  blurb: string;
  description: string;
}

export const ISSUE_TEMPLATES: IssueTemplate[] = [
  {
    id: "fix-bug",
    title: "Fix: <one-line description>",
    type: "bug",
    priority: "high",
    icon: "🐛",
    blurb: "Reproducible bug with steps + expected/actual",
    description: `## Overview

What's broken? Short summary.

## Reproduction steps

1. ...
2. ...
3. Observe …

## Expected behavior

What should happen.

## Actual behavior

What actually happens.

## Environment

Browser, OS, version, config flags.
`,
  },
  {
    id: "add-feature",
    title: "Add: <feature name>",
    type: "feature",
    priority: "medium",
    icon: "✨",
    blurb: "New feature with acceptance criteria",
    description: `## Overview

What needs to happen and why?

## Acceptance criteria

- [ ] User can …
- [ ] System validates …
- [ ] Tests cover …
`,
  },
  {
    id: "refactor",
    title: "Refactor: <module>",
    type: "task",
    priority: "low",
    icon: "🔧",
    blurb: "Code cleanup without behavior change",
    description: `## Overview

What needs refactoring and why? Link to the smell/issue.

## Acceptance criteria

- [ ] Behavior unchanged (existing tests pass)
- [ ] Cyclomatic complexity reduced / structure improved
- [ ] No new public API surface
`,
  },
  {
    id: "investigate",
    title: "Investigate: <topic>",
    type: "spike",
    priority: "medium",
    icon: "🔬",
    blurb: "Time-boxed research / spike",
    description: `## Overview

What question are we answering? What decision blocks on this?

## Time-box

… hours / days

## Deliverable

- [ ] Write a brief in docs/research/<slug>.md
- [ ] Recommend next action (do / drop / dig deeper)
`,
  },
  {
    id: "blank",
    title: "",
    type: "task",
    priority: "medium",
    icon: "📝",
    blurb: "Start blank",
    description: "",
  },
];
