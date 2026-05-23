"use client";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WorkspacesApi, getActiveWorkspace } from "@/lib/api-client";
import { BillingApi, type Plan } from "@/lib/billing-api";
import { cn, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="t-small" style={{ color: "var(--text-tertiary)" }}>Loading…</div>}>
      <BillingInner />
    </Suspense>
  );
}

function BillingInner() {
  const search = useSearchParams();
  const sessionStatus = search.get("status"); // "success" | "cancel" after Checkout return
  const [activeWs, setActiveWs] = useState<string | null>(null);
  useEffect(() => setActiveWs(getActiveWorkspace()), []);

  const ws = useQuery({
    queryKey: ["workspaces"],
    queryFn: WorkspacesApi.listMine,
  });
  const current = (ws.data ?? []).find((w) => w.slug === activeWs);

  const state = useQuery({
    queryKey: ["billing-state", current?.id],
    queryFn: () => BillingApi.state(current!.id),
    enabled: !!current?.id,
    refetchInterval: 10_000,
  });

  const plansData = useQuery({ queryKey: ["billing-plans"], queryFn: BillingApi.listPlans });
  const invoices = useQuery({
    queryKey: ["billing-invoices", current?.id],
    queryFn: () => BillingApi.invoices(current!.id),
    enabled: !!current?.id,
  });

  const checkout = useMutation({
    mutationFn: ({ plan, seats }: { plan: "pro" | "team"; seats: number }) =>
      BillingApi.createCheckoutSession(current!.id, plan, seats),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const cancel = useMutation({
    mutationFn: () => BillingApi.cancel(current!.id),
  });

  if (!current) {
    return (
      <div className="t-small" style={{ color: "var(--text-tertiary)" }}>
        Pick a workspace from the sidebar switcher.
      </div>
    );
  }

  const billingEnabled = plansData.data?.billing_enabled ?? false;
  const usagePct = state.data && state.data.llm_cap_cents
    ? Math.min(100, (state.data.llm_spend_cents_this_period / state.data.llm_cap_cents) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {sessionStatus === "success" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-md border p-3 text-sm"
          style={{
            background: "var(--status-success-bg)",
            borderColor: "var(--status-success-border)",
            color: "var(--status-success)",
          }}
        >
          ✓ Subscription activated. Welcome aboard.
        </motion.div>
      )}
      {sessionStatus === "cancel" && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: "var(--bg-subtle)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          Checkout canceled. You're still on your current plan.
        </div>
      )}

      <header>
        <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Billing</h1>
        <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
          Workspace: <strong style={{ color: "var(--text-primary)" }}>{current.name}</strong> ·
          Plan: <strong style={{ color: "var(--text-primary)" }}>{state.data?.plan_display_name || state.data?.plan || "—"}</strong>
        </p>
      </header>

      {state.data?.payment_overdue && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: "var(--status-danger-bg)",
            borderColor: "var(--status-danger-border)",
            color: "var(--status-danger)",
          }}
        >
          ⚠ Payment overdue since {state.data.payment_overdue_since && formatRelativeTime(state.data.payment_overdue_since)}.
          Workflows are paused — update payment to resume.
        </div>
      )}

      {/* Usage meter */}
      {state.data && state.data.llm_cap_cents !== null && (
        <section
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>LLM usage this period</h2>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              ${(state.data.llm_spend_cents_this_period / 100).toFixed(2)}
            </span>
            <span className="t-small" style={{ color: "var(--text-tertiary)" }}>
              of ${(state.data.llm_cap_cents / 100).toFixed(2)} cap
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                background: usagePct > 90 ? "var(--status-danger)" : usagePct > 70 ? "var(--status-warning)" : "var(--accent)",
                width: `${usagePct}%`,
              }}
            />
          </div>
          {state.data.period_started_at && (
            <p className="t-tiny mt-2" style={{ color: "var(--text-tertiary)" }}>
              Period started {formatRelativeTime(state.data.period_started_at)} · resets every 30 days
            </p>
          )}
        </section>
      )}

      {/* Plans */}
      {plansData.data && (
        <section className="space-y-3">
          <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>
            {state.data?.plan === "free" ? "Upgrade your plan" : "Change plan"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {plansData.data.plans.map((p) => (
              <PlanCard
                key={p.key}
                plan={p}
                current={state.data?.plan === p.key}
                disabled={!billingEnabled || p.key === "free" || checkout.isPending || p.key === state.data?.plan}
                onUpgrade={() => {
                  if (p.key === "pro" || p.key === "team") {
                    checkout.mutate({ plan: p.key, seats: 1 });
                  }
                }}
                pending={checkout.isPending}
              />
            ))}
          </div>
          {!billingEnabled && (
            <p className="t-small" style={{ color: "var(--text-tertiary)" }}>
              Live billing is disabled in this environment. Self-host users can stay on Free indefinitely.
            </p>
          )}
        </section>
      )}

      {/* Invoices */}
      {(invoices.data?.invoices.length ?? 0) > 0 && (
        <section
          className="rounded-xl border overflow-hidden"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <header className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>Recent invoices</h2>
          </header>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                <th className="px-4 py-2 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Number</th>
                <th className="px-4 py-2 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Date</th>
                <th className="px-4 py-2 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Amount</th>
                <th className="px-4 py-2 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.data!.invoices.map((inv) => (
                <tr key={inv.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                    {inv.number || inv.id.slice(0, 12)}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {new Date(inv.created * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 tabular-nums" style={{ color: "var(--text-primary)" }}>
                    ${(inv.amount_paid / 100).toFixed(2)} {inv.currency.toUpperCase()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: inv.status === "paid" ? "var(--status-success-bg)" : "var(--bg-subtle)",
                        color: inv.status === "paid" ? "var(--status-success)" : "var(--text-tertiary)",
                      }}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {inv.invoice_pdf && (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener"
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Cancel subscription */}
      {state.data?.stripe_subscription_id && current.role === "owner" && (
        <section
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>Cancel subscription</h2>
          <p className="t-small mt-2" style={{ color: "var(--text-tertiary)" }}>
            Cancellation takes effect at the end of your current billing period. You'll keep access until then, then drop to Free.
          </p>
          <button
            onClick={() => {
              if (confirm("Cancel subscription at end of period?")) cancel.mutate();
            }}
            disabled={cancel.isPending}
            className="mt-3 px-3 py-1.5 rounded-md text-sm font-medium border transition disabled:opacity-50"
            style={{
              borderColor: "var(--status-danger-border)",
              color: "var(--status-danger)",
              background: "transparent",
            }}
          >
            {cancel.isPending ? "Canceling…" : "Cancel at period end"}
          </button>
        </section>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  current,
  disabled,
  onUpgrade,
  pending,
}: {
  plan: Plan;
  current: boolean;
  disabled: boolean;
  onUpgrade: () => void;
  pending: boolean;
}) {
  return (
    <div
      className={cn("rounded-xl border p-4 flex flex-col")}
      style={{
        background: "var(--bg-surface)",
        borderColor: current ? "var(--accent)" : "var(--border)",
        boxShadow: current ? "var(--shadow-sm)" : undefined,
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {plan.display_name}
        </h3>
        {current && (
          <span
            className="text-[10px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Current
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold mt-2 tabular-nums" style={{ color: "var(--text-primary)" }}>
        ${plan.monthly_usd}
        <span className="text-sm font-normal ml-1" style={{ color: "var(--text-tertiary)" }}>/mo</span>
      </div>
      <ul className="mt-3 space-y-1 flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        {plan.features.slice(0, 4).map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <span style={{ color: "var(--status-success)" }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {plan.key !== "free" && (
        <button
          onClick={onUpgrade}
          disabled={disabled}
          className="mt-3 px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50"
          style={{
            background: current ? "var(--bg-subtle)" : "var(--accent)",
            color: current ? "var(--text-tertiary)" : "var(--accent-fg)",
          }}
        >
          {current ? "Current plan" : pending ? "Loading…" : `Upgrade to ${plan.display_name}`}
        </button>
      )}
    </div>
  );
}
