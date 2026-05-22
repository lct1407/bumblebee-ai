"use client";
import Link from "next/link";

export function CTA() {
  return (
    <section className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-zinc-950 py-24 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-32 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <div className="text-6xl mb-6 animate-float inline-block">🐝</div>
        <h2 className="text-4xl sm:text-6xl font-bold tracking-tight">
          Ship multi-agent automation today
        </h2>
        <p className="mt-6 text-xl text-zinc-800 max-w-2xl mx-auto">
          MIT-licensed. Self-hostable in minutes. Plugin-ready for your domain.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-zinc-950 text-amber-400 font-bold hover:bg-zinc-900 transition-all hover:scale-105 shadow-2xl"
          >
            Try Dashboard
          </Link>
          <a
            href="https://github.com/lct1407/bumblebee"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-white/20 backdrop-blur border border-zinc-950/20 text-zinc-950 font-bold hover:bg-white/30 transition"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>

        <div className="mt-12 inline-block rounded-lg bg-zinc-950 text-zinc-100 px-6 py-3 font-mono text-sm">
          $ pip install bumblebee-ai
        </div>
      </div>
    </section>
  );
}
