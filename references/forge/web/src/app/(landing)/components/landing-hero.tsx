import Link from 'next/link';
import { Zap, ArrowRight } from 'lucide-react';

export function LandingHero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-16 text-center overflow-hidden">
      {/* Glow */}
      <div className="pointer-events-none absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.08)_0%,rgba(249,115,22,0.02)_40%,transparent_70%)] animate-pulse" />

      <div className="inline-flex items-center gap-2 rounded-full border border-[#3d3528] bg-[#1a1815] px-4 py-1.5 text-xs text-[#9c9588] font-mono tracking-wide mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Open Source &middot; Self-Hosted
      </div>

      <h1 className="font-serif text-6xl sm:text-7xl md:text-8xl tracking-tight leading-none mb-6">
        <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">Forge</span>
      </h1>

      <p className="text-lg sm:text-xl text-[#9c9588] max-w-lg mx-auto font-light leading-relaxed mb-10">
        AI-powered project management for engineering teams.
        From issue to resolution — let agents do the heavy lifting.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-medium text-white hover:bg-amber-400 transition-all hover:-translate-y-0.5 shadow-[0_0_0_1px_rgba(249,115,22,0.3),0_4px_24px_rgba(249,115,22,0.2)] hover:shadow-[0_0_0_1px_rgba(249,115,22,0.5),0_8px_40px_rgba(249,115,22,0.3)]">
          <Zap className="w-4 h-4" />
          Start Building
        </Link>
        <a href="#features" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#3d3528] bg-[#1a1815] px-6 py-3 font-medium text-[#f0ebe3] hover:bg-[#1e1c18] hover:border-[#6b655c] transition-all hover:-translate-y-0.5">
          Explore Features
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}
