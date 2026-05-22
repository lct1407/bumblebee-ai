"use client";
import { useEffect, useState } from "react";

const STEPS = [
  { cmd: "$ pip install bumblebee-ai", out: "Installing bumblebee-ai-0.4.0... done" },
  { cmd: "$ bumblebee db migrate && bumblebee db seed", out: "✓ 17 tables, 7 agents, 3 workflows, 5 knowledge entries" },
  { cmd: "$ bumblebee server &", out: "INFO  Uvicorn running on http://0.0.0.0:8000" },
  { cmd: "$ bb issue create 'Add OAuth login' --priority=high", out: "✓ created BB-42: Add OAuth login" },
  { cmd: "$ bb run trigger 42", out: "▶ workflow_started → triage → plan → 4 parallel specialists → integrate → review → done" },
];

export function CodeDemo() {
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState<typeof STEPS>([]);
  const [typing, setTyping] = useState("");

  useEffect(() => {
    if (idx >= STEPS.length) {
      const t = setTimeout(() => {
        setIdx(0);
        setDisplayed([]);
        setTyping("");
      }, 4000);
      return () => clearTimeout(t);
    }
    const target = STEPS[idx].cmd;
    let i = 0;
    const interval = setInterval(() => {
      setTyping(target.slice(0, ++i));
      if (i >= target.length) {
        clearInterval(interval);
        setTimeout(() => {
          setDisplayed((prev) => [...prev, STEPS[idx]]);
          setTyping("");
          setIdx((n) => n + 1);
        }, 400);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [idx]);

  return (
    <section className="relative bg-black text-white py-24" id="quickstart">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-bold">
            <span className="text-gradient">Five commands</span> to first workflow
          </h2>
          <p className="mt-4 text-zinc-400">From bare metal to live multi-agent execution.</p>
        </div>

        <div className="shimmer-border rounded-xl">
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
            {/* macOS-style header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-4 text-xs text-zinc-500 font-mono">~/bumblebee-demo</span>
            </div>
            <div className="p-6 font-mono text-sm min-h-[320px] space-y-3">
              {displayed.map((s, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-amber-400">{s.cmd}</div>
                  <div className="text-zinc-400 pl-2">{s.out}</div>
                </div>
              ))}
              {idx < STEPS.length && (
                <div>
                  <span className="text-amber-400">{typing}</span>
                  <span className="inline-block w-2 h-4 bg-amber-400 ml-0.5 animate-pulse" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
