"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Combobox } from "@/components/ui/combobox";
import { parseDescription, serializeDescription, type IssueSections } from "@/lib/issue-sections";
import type { Issue } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "task", label: "Task" },
  { value: "story", label: "Story" },
  { value: "epic", label: "Epic" },
  { value: "chore", label: "Chore" },
  { value: "spike", label: "Spike" },
];

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "planned", label: "Planned" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "closed", label: "Closed" },
  { value: "failed", label: "Failed" },
  { value: "wont_fix", label: "Won't Fix" },
];

type Mode = "create" | "edit";

interface IssueFormValues {
  title: string;
  type: string;
  priority: string;
  status: string;
  sections: IssueSections;
  scope_hints: string[];
}

export function IssueForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  submitting = false,
}: {
  mode: Mode;
  initial?: Partial<Issue>;
  onSubmit: (payload: { title: string; type: string; priority: string; status?: string; description: string; scope_hints: string[] }) => void;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<IssueFormValues>(() => ({
    title: initial?.title ?? "",
    type: initial?.type ?? "task",
    priority: initial?.priority ?? "medium",
    status: initial?.status ?? "new",
    sections: parseDescription(initial?.description ?? ""),
    scope_hints: initial?.scope_hints ?? [],
  }));

  useEffect(() => {
    if (initial) {
      setValues({
        title: initial.title ?? "",
        type: initial.type ?? "task",
        priority: initial.priority ?? "medium",
        status: initial.status ?? "new",
        sections: parseDescription(initial.description ?? ""),
        scope_hints: initial.scope_hints ?? [],
      });
    }
  }, [initial?.id]);

  const [tab, setTab] = useState<"details" | "acceptance" | "diagnostics">("details");
  const isBug = values.type === "bug";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return;
    onSubmit({
      title: values.title.trim(),
      type: values.type,
      priority: values.priority,
      status: mode === "edit" ? values.status : undefined,
      description: serializeDescription(values.sections, values.type),
      scope_hints: values.scope_hints,
    });
  };

  const updateSection = <K extends keyof IssueSections>(key: K, val: IssueSections[K]) =>
    setValues((v) => ({ ...v, sections: { ...v.sections, [key]: val } }));

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-5">
      <Field label="Title">
        <input
          type="text"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          required
          autoFocus
          placeholder="Short, descriptive title"
          className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm"
          style={inputStyle}
        />
      </Field>

      <div className={cn("grid gap-3", mode === "edit" ? "grid-cols-3" : "grid-cols-2")}>
        <Field label="Type">
          <Combobox
            options={TYPE_OPTIONS}
            value={values.type}
            onChange={(t: string) => setValues((v) => ({ ...v, type: t }))}
            className="w-full"
          />
        </Field>
        <Field label="Priority">
          <Combobox
            options={PRIORITY_OPTIONS}
            value={values.priority}
            onChange={(p: string) => setValues((v) => ({ ...v, priority: p }))}
            className="w-full"
          />
        </Field>
        {mode === "edit" && (
          <Field label="Status">
            <Combobox
              options={STATUS_OPTIONS}
              value={values.status}
              onChange={(s: string) => setValues((v) => ({ ...v, status: s }))}
              className="w-full"
            />
          </Field>
        )}
      </div>

      {/* Section tabs */}
      <div className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-4 -mb-px">
          <TabBtn active={tab === "details"} onClick={() => setTab("details")}>Details</TabBtn>
          <TabBtn active={tab === "acceptance"} onClick={() => setTab("acceptance")}>
            Acceptance
          </TabBtn>
          {isBug && (
            <TabBtn active={tab === "diagnostics"} onClick={() => setTab("diagnostics")}>
              Diagnostics
            </TabBtn>
          )}
        </div>
      </div>

      {tab === "details" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <Field
            label="Overview"
            hint={isBug ? "What's broken? Short summary." : "What needs to happen and why?"}
          >
            <textarea
              value={values.sections.overview}
              onChange={(e) => updateSection("overview", e.target.value)}
              rows={5}
              placeholder={isBug
                ? "Brief description of the bug…"
                : "Brief description, motivation, context…"}
              className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-sans"
              style={inputStyle}
            />
          </Field>
          <Field label="Scope hints" hint="File/path patterns the agent should focus on. Comma-separated.">
            <ScopeInput
              value={values.scope_hints}
              onChange={(scope_hints) => setValues((v) => ({ ...v, scope_hints }))}
            />
          </Field>
        </motion.div>
      )}

      {tab === "acceptance" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <Field
            label="Acceptance criteria"
            hint="One per line. Use `- [ ] item` for checklist items."
          >
            <textarea
              value={values.sections.acceptance}
              onChange={(e) => updateSection("acceptance", e.target.value)}
              rows={8}
              placeholder={"- [ ] User can log in with Google\n- [ ] Session persists across reloads\n- [ ] Logout clears all auth state"}
              className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-mono"
              style={inputStyle}
            />
          </Field>
        </motion.div>
      )}

      {tab === "diagnostics" && isBug && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <Field label="Reproduction steps" hint="Numbered steps to reproduce.">
            <textarea
              value={values.sections.reproduction}
              onChange={(e) => updateSection("reproduction", e.target.value)}
              rows={4}
              placeholder={"1. Go to /login\n2. Click 'Sign in with Google'\n3. Observe 500 error"}
              className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-mono"
              style={inputStyle}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected">
              <textarea
                value={values.sections.expected}
                onChange={(e) => updateSection("expected", e.target.value)}
                rows={3}
                placeholder="Successful sign-in, redirect to /dashboard"
                className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-sans"
                style={inputStyle}
              />
            </Field>
            <Field label="Actual">
              <textarea
                value={values.sections.actual}
                onChange={(e) => updateSection("actual", e.target.value)}
                rows={3}
                placeholder="500 Internal Server Error on POST /auth/google/callback"
                className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-sans"
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Environment" hint="Browser, OS, version, config flags.">
            <textarea
              value={values.sections.environment}
              onChange={(e) => updateSection("environment", e.target.value)}
              rows={2}
              placeholder="Chrome 121 · macOS 14.3 · bumblebee 0.4.0 · BUMBLEBEE_AUTH=on"
              className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-mono"
              style={inputStyle}
            />
          </Field>
          <Field label="Root cause" hint="Usually filled by triage agent. Leave empty on create.">
            <textarea
              value={values.sections.root_cause}
              onChange={(e) => updateSection("root_cause", e.target.value)}
              rows={3}
              placeholder="…"
              className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-sans"
              style={inputStyle}
            />
          </Field>
        </motion.div>
      )}

      <div className="flex items-center gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm transition hover:bg-[var(--bg-subtle)]"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!values.title.trim() || submitting}
          className="ml-auto px-3 py-1.5 rounded-md font-medium text-sm transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {submitting ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create issue" : "Save changes")}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>{label}</label>
      {children}
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--text-quaternary)" }}>{hint}</p>}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative pb-2 text-sm font-medium transition"
      style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)" }}
    >
      {children}
      {active && (
        <motion.span
          layoutId="form-tab-active"
          className="absolute -bottom-px left-0 right-0 h-[2px]"
          style={{ background: "var(--accent)" }}
        />
      )}
    </button>
  );
}

function ScopeInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));

  useEffect(() => {
    setText(value.join(", "));
  }, [value]);

  const commit = () => {
    const next = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange(next);
  };

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      placeholder="api/src/auth/**, web/src/app/login/**"
      className="w-full px-3 py-2 rounded-md border outline-none focus:border-[var(--accent)] text-sm font-mono"
      style={inputStyle}
    />
  );
}
