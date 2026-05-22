"use client";
import { motion } from "framer-motion";

const INTEGRATIONS = [
  { name: "Anthropic", category: "LLM", icon: "🤖" },
  { name: "OpenAI", category: "LLM", icon: "🧠" },
  { name: "Gemini", category: "LLM", icon: "💎" },
  { name: "PostgreSQL", category: "Database", icon: "🐘" },
  { name: "LangGraph", category: "Engine", icon: "🔄" },
  { name: "FastAPI", category: "Backend", icon: "⚡" },
  { name: "Next.js", category: "Frontend", icon: "▲" },
  { name: "Docker", category: "Deploy", icon: "🐳" },
  { name: "OpenTelemetry", category: "Observability", icon: "📡" },
  { name: "GitHub", category: "Git", icon: "🐙" },
  { name: "Slack", category: "Notifications", icon: "💬" },
  { name: "PyPI", category: "Distribution", icon: "📦" },
];

export function Integrations() {
  return (
    <section className="relative bg-black text-white py-24 overflow-hidden">
      <div className="bg-honeycomb absolute inset-0 opacity-30" />
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold">
            Plays well with <span className="text-gradient">your stack</span>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            Built on open standards. Plugin extensibility means anything missing — you can add.
          </p>
        </motion.div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {INTEGRATIONS.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ scale: 1.08, y: -4 }}
              className="group rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/60 to-zinc-950 p-5 flex flex-col items-center text-center cursor-default hover:border-amber-500/40 transition"
            >
              <div className="text-4xl mb-2 group-hover:scale-110 transition">{item.icon}</div>
              <div className="text-sm font-semibold text-white">{item.name}</div>
              <div className="text-xs text-zinc-500 mt-1">{item.category}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
