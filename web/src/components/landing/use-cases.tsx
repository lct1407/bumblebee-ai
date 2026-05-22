"use client";
import { useEffect, useRef } from "react";

const CASES = [
  {
    title: "Dev Task Automation",
    desc: "PR triage, dependency updates, code migrations, bug fixes — pipelined through specialist agents.",
    icon: "💻",
  },
  {
    title: "DevOps Orchestration",
    desc: "Deployment pipelines, incident response, monitoring triage — bounded by per-action approval.",
    icon: "🚀",
  },
  {
    title: "Business Workflow",
    desc: "Customer support, content generation, data pipelines — domain plugins extend the platform.",
    icon: "📊",
  },
  {
    title: "Research & Analysis",
    desc: "Multi-agent research with Coordinator decomposing complex questions across specialists.",
    icon: "🔬",
  },
];

export function UseCases() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.2 });
    ref.current?.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="bg-zinc-950 text-white py-24" id="use-cases">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 reveal">
          <h2 className="text-4xl sm:text-5xl font-bold">
            Built for <span className="text-gradient">any domain</span>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            Plugin-ready architecture. Ship a new domain as a pypi package — zero core changes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CASES.map((c, i) => (
            <div
              key={c.title}
              className="reveal group rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-8 hover:border-amber-500/30 transition-all duration-300"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-start gap-4">
                <div className="text-5xl group-hover:scale-110 transition-transform">{c.icon}</div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-2">{c.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
