"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { IssuesApi, WorkflowApi, WorkspacesApi, getActiveWorkspace, setActiveWorkspace } from "@/lib/api-client";
import { ISSUE_TEMPLATES, type IssueTemplate } from "@/lib/issue-templates";
import { cn } from "@/lib/utils";

// Disable static prerender — the wizard reads ?plan= and uses localStorage
export const dynamic = "force-dynamic";

type Step = 1 | 2 | 3 | 4;

interface OnboardState {
  workspaceName: string;
  workspaceId?: string;
  invites: string[];
  template?: IssueTemplate;
  customTitle: string;
  issueNumber?: number;
  workflowTriggered?: boolean;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

export default function OnboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg-canvas)" }} />}>
      <OnboardInner />
    </Suspense>
  );
}

function OnboardInner() {
  const router = useRouter();
  const search = useSearchParams();
  const plan = search.get("plan");

  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<OnboardState>({
    workspaceName: "",
    invites: [],
    customTitle: "",
  });

  const createWs = useMutation({
    mutationFn: (name: string) => WorkspacesApi.create(name),
    onSuccess: (ws) => {
      setActiveWorkspace(ws.slug);
      setState((s) => ({ ...s, workspaceId: ws.id }));
      setStep(2);
    },
  });

  const inviteOne = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      WorkspacesApi.invite(id, email),
  });

  const createIssue = useMutation({
    mutationFn: () =>
      IssuesApi.create(getActiveWorkspace() || "bb", {
        title: state.customTitle || state.template?.title || "First issue",
        description: state.template?.description,
        type: state.template?.type ?? "task",
        priority: state.template?.priority ?? "medium",
      }),
    onSuccess: (issue) => {
      setState((s) => ({ ...s, issueNumber: issue.number }));
      setStep(4);
    },
  });

  const trigger = useMutation({
    mutationFn: (issueId: string) => WorkflowApi.trigger(issueId),
    onSuccess: () => {
      setState((s) => ({ ...s, workflowTriggered: true }));
    },
  });

  const goDashboard = () => {
    if (plan && plan !== "free" && state.workspaceId) {
      // Pro/Team — after onboarding, jump to checkout (Phase D wire-up).
      router.push(`/settings/billing?upgrade=${plan}`);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-canvas)" }}
    >
      <div className="w-full max-w-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-8">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className="h-1 rounded-full transition-all"
              style={{
                width: n === step ? 32 : 12,
                background: n <= step ? "var(--accent)" : "var(--bg-subtle)",
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border p-8"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            {step === 1 && (
              <div className="space-y-4">
                <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
                  Create your workspace
                </h1>
                <p className="t-small" style={{ color: "var(--text-tertiary)" }}>
                  Workspaces hold your projects, issues, and team. You can create more later.
                </p>
                <input
                  type="text"
                  autoFocus
                  value={state.workspaceName}
                  onChange={(e) => setState((s) => ({ ...s, workspaceName: e.target.value }))}
                  placeholder="e.g. Acme Engineering"
                  className="w-full px-4 py-3 rounded-md border text-base outline-none focus:border-[var(--accent)]"
                  style={inputStyle}
                />
                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm transition hover:underline"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Skip onboarding
                  </button>
                  <button
                    onClick={() => state.workspaceName && createWs.mutate(state.workspaceName)}
                    disabled={!state.workspaceName.trim() || createWs.isPending}
                    className="px-4 py-2 rounded-md text-sm font-medium transition disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    {createWs.isPending ? "Creating…" : "Next →"}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
                  Invite your team
                </h1>
                <p className="t-small" style={{ color: "var(--text-tertiary)" }}>
                  Send invites by email. They'll get a link to join your workspace. Skip if solo.
                </p>
                <InviteList
                  emails={state.invites}
                  onChange={(invites) => setState((s) => ({ ...s, invites }))}
                />
                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setStep(3)}
                    className="text-sm transition hover:underline"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Skip
                  </button>
                  <button
                    onClick={async () => {
                      if (state.workspaceId) {
                        for (const email of state.invites) {
                          await inviteOne.mutateAsync({ id: state.workspaceId, email });
                        }
                      }
                      setStep(3);
                    }}
                    disabled={inviteOne.isPending}
                    className="px-4 py-2 rounded-md text-sm font-medium transition disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    {inviteOne.isPending ? "Sending…" : state.invites.length > 0 ? `Send ${state.invites.length} & continue →` : "Continue →"}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
                  Create your first issue
                </h1>
                <p className="t-small" style={{ color: "var(--text-tertiary)" }}>
                  Pick a template to get started. You can customize the title below.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ISSUE_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setState((s) => ({
                        ...s,
                        template: t,
                        customTitle: t.title,
                      }))}
                      className={cn(
                        "text-left rounded-md border p-3 transition",
                      )}
                      style={{
                        background: state.template?.id === t.id
                          ? "var(--accent-subtle)"
                          : "var(--bg-surface)",
                        borderColor: state.template?.id === t.id
                          ? "var(--accent)"
                          : "var(--border)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{t.icon}</span>
                        <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                          {t.id === "blank" ? "Blank" : t.title.split(":")[0]}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.blurb}</p>
                    </button>
                  ))}
                </div>
                {state.template && (
                  <input
                    type="text"
                    value={state.customTitle}
                    onChange={(e) => setState((s) => ({ ...s, customTitle: e.target.value }))}
                    placeholder="Customize the title"
                    className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)]"
                    style={inputStyle}
                  />
                )}
                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setStep(2)}
                    className="text-sm transition hover:underline"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => createIssue.mutate()}
                    disabled={!state.template || createIssue.isPending}
                    className="px-4 py-2 rounded-md text-sm font-medium transition disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    {createIssue.isPending ? "Creating…" : "Create issue →"}
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5 text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                  style={{ background: "var(--status-success-bg)" }}
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" style={{ color: "var(--status-success)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
                  You're set up
                </h1>
                <p className="t-body max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
                  Workspace created · {state.invites.length > 0 && `${state.invites.length} invite${state.invites.length === 1 ? "" : "s"} sent · `}First issue filed as #{state.issueNumber}.
                </p>
                {plan && plan !== "free" && (
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Next: complete your <strong>{plan}</strong> subscription on the billing page.
                  </p>
                )}
                <div className="pt-4">
                  <button
                    onClick={goDashboard}
                    className="px-5 py-2.5 rounded-md text-sm font-medium transition"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    {plan && plan !== "free" ? "Continue to billing →" : "Open dashboard →"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function InviteList({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const addEmail = () => {
    const e = draft.trim().toLowerCase();
    if (!e || emails.includes(e) || !/.+@.+\..+/.test(e)) return;
    onChange([...emails, e]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="teammate@example.com"
          className="flex-1 px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)]"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={addEmail}
          className="px-3 py-2 rounded-md text-sm font-medium border transition hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          + Add
        </button>
      </div>
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
              style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
            >
              {e}
              <button
                onClick={() => onChange(emails.filter((x) => x !== e))}
                className="hover:text-[var(--status-danger)]"
                style={{ color: "var(--text-tertiary)" }}
                aria-label="Remove"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
