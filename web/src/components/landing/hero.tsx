"use client";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-mesh min-h-[90vh] flex items-center">
      {/* Hero background image (Vertex AI Imagen 4 generated) */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url('/images/hero-orchestration.png')" }}
      />
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none" />

      {/* Glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl animate-glow" />
      <div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-500/20 blur-3xl animate-glow"
        style={{ animationDelay: "2s" }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-24 text-center text-white">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium mb-8 animate-float">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          v0.4.0 — multi-agent concurrent task management
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Many agents.
          <br />
          <span className="text-gradient">One project. Together.</span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-zinc-300 max-w-2xl mx-auto">
          Bumblebee orchestrates multiple AI agents working concurrently on the same codebase —
          decomposed by a Coordinator, scope-leased for safety, replay-able via event sourcing.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 text-zinc-950 font-semibold hover:bg-amber-400 transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:shadow-amber-500/30"
          >
            Open Dashboard
            <svg
              className="w-4 h-4 group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <a
            href="https://pypi.org/project/bumblebee-ai/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-900 transition"
          >
            <code className="font-mono text-sm">pip install bumblebee-ai</code>
          </a>
        </div>

        <div className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-zinc-400">
          <Stat label="Tests passing" value="96" />
          <Stat label="Architecture planes" value="7" />
          <Stat label="LangGraph multi-node" value="Real" />
          <Stat label="Plugin-ready" value="entry_points" />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="uppercase tracking-wider text-xs">{label}</div>
    </div>
  );
}
