"use client";
import { motion } from "framer-motion";

const TIERS = [
  {
    name: "Open Source",
    tagline: "Self-host. Forever free.",
    price: "$0",
    period: "MIT licensed",
    cta: "Get on GitHub",
    href: "https://github.com/lct1407/bumblebee-ai",
    featured: false,
    features: [
      "All 7 architectural planes",
      "Plugin system (entry_points)",
      "LangGraph multi-node workflows",
      "Self-hosted Postgres + FastAPI",
      "Unlimited issues + agents",
      "MIT license — no restrictions",
      "Community Discord",
    ],
  },
  {
    name: "Pro",
    tagline: "For growing teams that need support",
    price: "$49",
    period: "per workspace / month",
    cta: "Start free trial",
    href: "/dashboard",
    featured: true,
    features: [
      "Everything in Open Source, plus:",
      "Hosted multi-tenant SaaS",
      "Managed Postgres + auto-backups",
      "Priority email support (24h SLA)",
      "Slack + Teams notifications",
      "SSO (Google, Microsoft)",
      "Audit log retention 1 year",
      "Up to 10 concurrent agents",
    ],
  },
  {
    name: "Enterprise",
    tagline: "Bespoke deployments at scale",
    price: "Custom",
    period: "annual contracts",
    cta: "Talk to sales",
    href: "mailto:sales@bumblebee.ai",
    featured: false,
    features: [
      "Everything in Pro, plus:",
      "On-prem / VPC deployment",
      "SLA 99.95% + dedicated success",
      "Custom plugin development",
      "Compliance review (SOC2, HIPAA)",
      "Unlimited concurrent agents",
      "Audit log retention 7 years",
      "Phone + chat support",
    ],
  },
];

export function Pricing() {
  return (
    <section className="bg-black text-white py-24" id="pricing">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold">
            Simple, <span className="text-gradient">honest pricing</span>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            Self-host free forever. Or let us manage it. No per-agent fees. No surprise overages.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`relative rounded-2xl p-8 ${
                tier.featured
                  ? "bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-zinc-950 border-2 border-amber-500/60 shadow-[0_30px_80px_-20px_rgba(245,158,11,0.4)]"
                  : "bg-gradient-to-br from-zinc-900/60 to-zinc-950 border border-zinc-800"
              }`}
            >
              {tier.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-amber-500 text-zinc-950 text-xs font-bold uppercase tracking-wider">
                  Most popular
                </div>
              )}
              <div>
                <h3 className="text-2xl font-bold">{tier.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">{tier.tagline}</p>
              </div>
              <div className="mt-6">
                <span className="text-5xl font-bold text-gradient">{tier.price}</span>
                <div className="text-sm text-zinc-500 mt-1">{tier.period}</div>
              </div>
              <a
                href={tier.href}
                className={`mt-8 block text-center py-3 rounded-lg font-bold transition ${
                  tier.featured
                    ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                }`}
              >
                {tier.cta}
              </a>
              <ul className="mt-8 space-y-3 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-zinc-300">
                    <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
