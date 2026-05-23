/**
 * Structured description sections.
 *
 * We don't add columns for acceptance criteria / repro steps / root cause to the DB.
 * Instead we serialize/parse markdown sections in the existing `description` field.
 * That way the rich form works against the existing API with zero migration.
 *
 * Wire format:
 *   ## Overview
 *   …text…
 *
 *   ## Acceptance criteria
 *   - [ ] Item 1
 *   - [ ] Item 2
 *
 *   ## Reproduction steps   (bugs only)
 *   1. …
 *   2. …
 *
 *   ## Expected behavior    (bugs only)
 *   ## Actual behavior      (bugs only)
 *   ## Root cause           (bugs only — filled by triage)
 *   ## Environment          (bugs only)
 */

export type SectionKey =
  | "overview"
  | "acceptance"
  | "reproduction"
  | "expected"
  | "actual"
  | "root_cause"
  | "environment";

export interface IssueSections {
  overview: string;
  acceptance: string;
  reproduction: string;
  expected: string;
  actual: string;
  root_cause: string;
  environment: string;
}

const HEADINGS: Record<SectionKey, string> = {
  overview: "Overview",
  acceptance: "Acceptance criteria",
  reproduction: "Reproduction steps",
  expected: "Expected behavior",
  actual: "Actual behavior",
  root_cause: "Root cause",
  environment: "Environment",
};

const HEADING_TO_KEY: Record<string, SectionKey> = Object.fromEntries(
  Object.entries(HEADINGS).map(([k, v]) => [v.toLowerCase(), k as SectionKey]),
) as Record<string, SectionKey>;

const EMPTY: IssueSections = {
  overview: "",
  acceptance: "",
  reproduction: "",
  expected: "",
  actual: "",
  root_cause: "",
  environment: "",
};

export function parseDescription(text: string | null | undefined): IssueSections {
  const out: IssueSections = { ...EMPTY };
  if (!text?.trim()) return out;

  // If no ## headings, treat entire text as overview (legacy)
  if (!/^##\s+/m.test(text)) {
    out.overview = text.trim();
    return out;
  }

  const lines = text.split(/\r?\n/);
  let current: SectionKey | null = null;
  const buf: Record<SectionKey, string[]> = {
    overview: [],
    acceptance: [],
    reproduction: [],
    expected: [],
    actual: [],
    root_cause: [],
    environment: [],
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const key = HEADING_TO_KEY[m[1].toLowerCase()];
      if (key) {
        current = key;
        continue;
      }
      // Unknown ## heading: drop into overview
      current = "overview";
      buf.overview.push(line);
      continue;
    }
    if (current) buf[current].push(line);
    else buf.overview.push(line);
  }

  for (const k of Object.keys(buf) as SectionKey[]) {
    out[k] = buf[k].join("\n").trim();
  }
  return out;
}

export function serializeDescription(s: IssueSections, type?: string): string {
  const parts: string[] = [];
  const showBugFields = type === "bug" || type === "incident";

  const push = (key: SectionKey, alwaysShow = false) => {
    const v = s[key]?.trim();
    if (!v && !alwaysShow) return;
    parts.push(`## ${HEADINGS[key]}\n\n${v}`);
  };

  push("overview");
  push("acceptance");

  if (showBugFields) {
    push("reproduction");
    push("expected");
    push("actual");
    push("environment");
    push("root_cause");
  }

  return parts.join("\n\n").trim();
}

export function isEmpty(s: IssueSections): boolean {
  return (
    !s.overview.trim() &&
    !s.acceptance.trim() &&
    !s.reproduction.trim() &&
    !s.expected.trim() &&
    !s.actual.trim() &&
    !s.root_cause.trim() &&
    !s.environment.trim()
  );
}

/** Renders an acceptance-criteria checklist count: 3/7. Returns null if no checklist. */
export function acceptanceProgress(acceptance: string): { done: number; total: number } | null {
  if (!acceptance) return null;
  const matches = acceptance.match(/^[\s-*]*\[([ xX])\]/gm);
  if (!matches?.length) return null;
  const done = matches.filter((m) => /\[[xX]\]/.test(m)).length;
  return { done, total: matches.length };
}
