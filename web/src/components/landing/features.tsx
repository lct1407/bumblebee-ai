"use client";
import { useEffect, useRef } from "react";

const FEATURES = [
  {
    title: "Scope Lease",
    badge: "Concurrency",
    body: "Atomic file-glob claims. Two agents can't touch overlapping scopes — guaranteed by the dispatch plane.",
    icon: "🔐",
  },
  {
    title: "Coordinator Pattern",
    badge: "Multi-agent",
    body: "Supervisor decomposes Complex issues into N specialist sub-tasks; integrates results on separate branches.",
    icon: "🐝",
  },
  {
    title: "Event-Sourced State",
    badge: "Replay-able",
    body: "Append-only event log is the canonical truth. Every LLM call, tool call, decision — deterministically replay-able.",
    icon: "📜",
  },
  {
    title: "Plugin Ecosystem",
    badge: "Extensible",
    body: "Ship pypi packages via Python entry_points. Auto-register workflows, agent prompts, skills, tools.",
    icon: "🧩",
  },
  {
    title: "Hard Budget Ceilings",
    badge: "Safety",
    body: "Per-session, per-issue, per-project caps. Loop detector + failure taxonomy + mitigation actuator.",
    icon: "⚡",
  },
  {
    title: "Real-time Streaming",
    badge: "WebSocket",
    body: "Live event push to your dashboard. Watch agents work in parallel, see decisions as they happen.",
    icon: "📡",
  },
];

export function Features() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    containerRef.current?.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative bg-zinc-950 text-white py-24 overflow-hidden" id="features">
      <div className="bg-honeycomb absolute inset-0 opacity-50" />
      <div ref={containerRef} className="relative max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 reveal">
          <h2 className="text-4xl sm:text-5xl font-bold">
            Built for <span className="text-gradient">concurrent autonomy</span>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            7 architectural planes. Every decision recorded. Every agent bounded. Every workflow replayable.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="reveal group relative rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 backdrop-blur p-6 hover:border-amber-500/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-500/10"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold mb-2">
                {f.badge}
              </div>
              <h3 className="text-xl font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
              <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
