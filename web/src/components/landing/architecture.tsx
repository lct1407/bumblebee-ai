"use client";
import { useEffect, useRef } from "react";

const PLANES = [
  { id: "control", name: "Control", body: "LangGraph engine + Coordinator + Router + HITL", color: "from-amber-500 to-orange-500" },
  { id: "dispatch", name: "Dispatch", body: "PG SKIP LOCKED queue + ScopeLease + DLQ", color: "from-pink-500 to-rose-500" },
  { id: "execution", name: "Execution", body: "Harness + ContextAssembler + Provider + Subagent", color: "from-purple-500 to-violet-500" },
  { id: "state", name: "State", body: "Event log canonical + Checkpoints + Materialized views", color: "from-blue-500 to-cyan-500" },
  { id: "safety", name: "Safety", body: "Budget ceilings + Loop detector + Failure classifier", color: "from-red-500 to-pink-500" },
  { id: "tool", name: "Tool", body: "Single-verb registry + Strict schemas + MCP", color: "from-emerald-500 to-teal-500" },
  { id: "obs", name: "Observability", body: "OTel traces + Cost tracker + Eval harness + Replay", color: "from-sky-500 to-indigo-500" },
];

export function Architecture() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    ref.current?.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="relative bg-gradient-to-b from-zinc-950 to-black text-white py-24" id="architecture">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 reveal">
          <h2 className="text-4xl sm:text-5xl font-bold">
            7 planes. <span className="text-gradient">Clean separation.</span>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            Every architectural concern is its own plane. No god classes. No hidden coupling.
            Plugins target a plane — never the whole system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANES.map((p, i) => (
            <div
              key={p.id}
              className="reveal relative rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-700 group transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${p.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
              <div className="relative p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${p.color}`} />
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-mono">
                    Plane {i + 1}
                  </span>
                </div>
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 reveal text-center">
          <a
            href="https://github.com/lct1407/bumblebee"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-amber-400 transition"
          >
            Read the architecture spec →
          </a>
        </div>
      </div>
    </section>
  );
}
