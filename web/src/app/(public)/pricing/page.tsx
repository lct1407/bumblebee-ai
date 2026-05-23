"use client";
import { motion } from "framer-motion";
import Link from "next/link";

interface Tier {
  key: "free" | "pro" | "team";
  name: string;
  priceLabel: string;
  blurb: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    priceLabel: "$0",
    blurb: "Get started — single workspace, capped LLM spend.",
    features: [
      "1 workspace",
      "5 active issues",
      "$1/mo LLM budget",
      "Community support",
    ],
    cta: "Start free",
    ctaHref: "/register?plan=free",
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "$20",
    blurb: "For solo devs + small teams running real workloads.",
    features: [
      "5 workspaces",
      "Unlimited issues",
      "$20/mo LLM budget per seat",
      "MCP server + Claude Code integration",
      "Email support (48h)",
    ],
    cta: "Upgrade to Pro",
    ctaHref: "/register?plan=pro",
    highlight: true,
  },
  {
    key: "team",
    name: "Team",
    priceLabel: "$100",
    blurb: "LLM-cost passthrough + unlimited everything.",
    features: [
      "Unlimited workspaces + issues",
      "LLM cost passthrough (metered)",
      "5 seats included; $20/extra",
      "Audit log + CSV export",
      "Priority support (24h)",
      "SOC2-prep docs + DPA",
    ],
    cta: "Talk to us",
    ctaHref: "mailto:sales@bumblebee.example.com",
  },
];

const FAQ = [
  {
    q: "What counts toward the LLM budget?",
    a: "Every Claude / LLM provider call made by your agents. We pass through the raw provider cost on the Team plan; Free/Pro have a hard cap that pauses workflows when reached.",
  },
  {
    q: "Can I self-host instead?",
    a: "Yes — Bumblebee is `pip install bumblebee-ai` away. Self-hosted is free + open-source. The SaaS tiers cover hosting, backups, support, and the MCP server proxy.",
  },
  {
    q: "What happens if I exceed my plan limits?",
    a: "Workflow triggers return 402 with an upgrade link. Existing data + reads continue working. No surprise charges.",
  },
  {
    q: "Do you offer annual pricing?",
    a: "Coming in v1.1 with a 2-month discount. Contact sales@ for early access.",
  },
  {
    q: "How do I cancel?",
    a: "From Settings → Billing. Cancellation effective at end of current period, no refund. Data retained 90 days for restore, then hard-deleted.",
  },
  {
    q: "Is my data isolated from other workspaces?",
    a: "Yes — every database row is scoped to your workspace_id. Cross-workspace access returns 403. See docs/security/security-policy.md.",
  },
];


export default function PricingPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-canvas)", color: "var(--text-primary)" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-14"
        >
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
            Simple, transparent pricing
          </h1>
          <p className="t-body mt-3 max-w-2xl mx-auto" style={{ color: "var(--text-tertiary)" }}>
            Self-host free + open-source, or use Bumblebee Cloud for hosting + support.
            No surprise charges — workflows pause at your budget.
          </p>
        </motion.header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TIERS.map((t, idx) => (
            <motion.div
              key={t.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className="rounded-2xl border p-6 flex flex-col relative"
              style={{
                background: "var(--bg-surface)",
                borderColor: t.highlight ? "var(--accent)" : "var(--border)",
                boxShadow: t.highlight ? "var(--shadow-md)" : undefined,
              }}
            >
              {t.highlight && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Most popular
                </span>
              )}
              <h2 className="t-h1" style={{ color: "var(--text-primary)" }}>{t.name}</h2>
              <div className="flex items-baseline gap-1.5 mt-3">
                <span
                  className="text-4xl font-semibold tabular-nums tracking-tight"
                  style={{ color: t.highlight ? "var(--accent)" : "var(--text-primary)" }}
                >
                  {t.priceLabel}
                </span>
                <span className="t-small" style={{ color: "var(--text-tertiary)" }}>
                  / month per seat
                </span>
              </div>
              <p className="t-small mt-2 mb-5" style={{ color: "var(--text-secondary)" }}>{t.blurb}</p>
              <ul className="space-y-2 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <svg
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                      style={{ color: t.highlight ? "var(--accent)" : "var(--status-success)" }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={t.ctaHref}
                className="mt-6 block text-center py-2.5 rounded-md text-sm font-medium transition"
                style={
                  t.highlight
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : {
                        background: "var(--bg-subtle)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }
                }
              >
                {t.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-20"
        >
          <h2 className="t-h1 text-center mb-8" style={{ color: "var(--text-primary)" }}>
            Frequently asked
          </h2>
          <div className="max-w-3xl mx-auto space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="rounded-lg border p-4 group"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
              >
                <summary
                  className="cursor-pointer font-medium text-sm flex items-center justify-between"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.q}
                  <svg
                    className="w-4 h-4 transition group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p
                  className="mt-3 text-sm leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </motion.section>

        <footer className="mt-16 text-center t-small" style={{ color: "var(--text-tertiary)" }}>
          <p>
            Already a customer? <Link href="/login" className="underline" style={{ color: "var(--accent)" }}>Sign in</Link>
          </p>
          <p className="mt-3">
            Self-host:{" "}
            <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)" }}>
              pip install bumblebee-ai
            </code>
          </p>
        </footer>
      </div>
    </div>
  );
}
