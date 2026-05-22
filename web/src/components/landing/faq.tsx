"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const FAQS = [
  {
    q: "How is Bumblebee different from LangGraph or CrewAI?",
    a: "LangGraph and CrewAI are agent frameworks — you build agents on top of them. Bumblebee is a full task management platform with multi-agent execution built in. Think Jira + LangChain in one. We use LangGraph under the hood for the workflow engine but layer on issue tracking, scope leases, plugin distribution, event sourcing, and a complete web UI.",
  },
  {
    q: "What LLM providers are supported?",
    a: "Anthropic Claude (via claude-cli, CLI binary required) is the primary provider. The Provider abstraction supports OpenAI and Gemini as adapters — wire-in scaffold ready. Plugin authors can add custom providers via the same interface.",
  },
  {
    q: "How do agents avoid stepping on each other's code?",
    a: "Every agent must acquire an atomic ScopeLease on file globs before touching code. Two agents requesting overlapping scopes? Second one queues until first releases. No merge conflicts possible at the orchestration layer.",
  },
  {
    q: "What's the actual cost per workflow run?",
    a: "Around $0.05 per multi-node workflow (3 sessions: triager + implementer + tester) with Claude Sonnet 4.6 — verified live in our testing. Costs are tracked per-session, per-issue, and per-project with hard ceilings to prevent runaway spend.",
  },
  {
    q: "Is the code really MIT licensed?",
    a: "Yes. The entire codebase — backend, frontend, plugin system, CLI — is MIT licensed. Self-host commercially. Modify freely. The Pro and Enterprise tiers are hosting + support, not code restrictions.",
  },
  {
    q: "How do I add a custom workflow for my domain?",
    a: "Two ways: (1) drop a YAML workflow into the workflows/ folder and restart — instant. (2) ship a pypi plugin package with entry_points declaration. Your plugin can contribute workflows, agent definitions, skills, and tools. Other users `pip install bumblebee-plugin-mything` and it auto-registers.",
  },
  {
    q: "Can I migrate from an existing task tracker?",
    a: "We have a v2 → v3 import script for Bumblebee users. For external trackers (Jira, Linear, GitHub Issues), use the REST API to bulk-create issues — `POST /api/projects/{slug}/issues`. Plugin support for direct migration adapters is on the roadmap.",
  },
  {
    q: "What's the deployment story?",
    a: "Single command: `docker compose -f docker-compose.prod.yml up`. Brings up PostgreSQL + API + Web. Healthchecks, restart policies, env-driven config baked in. For Kubernetes, the Docker image is production-grade with non-root user, multi-stage build, and signed releases via pypi.",
  },
];

function FAQItem({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="border border-zinc-800 rounded-xl overflow-hidden bg-gradient-to-br from-zinc-900/60 to-zinc-950"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-zinc-800/30 transition"
      >
        <span className="font-semibold text-white">{q}</span>
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="w-5 h-5 text-amber-400 flex-shrink-0 ml-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 text-zinc-400 leading-relaxed">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-zinc-950 text-white py-24" id="faq">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold">Frequently asked</h2>
          <p className="mt-4 text-zinc-400">No fluff. Real answers.</p>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((item, i) => (
            <FAQItem
              key={item.q}
              q={item.q}
              a={item.a}
              isOpen={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
