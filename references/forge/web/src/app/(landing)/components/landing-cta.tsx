import Link from 'next/link';
import { Zap } from 'lucide-react';

export function LandingCta() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-24 text-center">
      <div className="pointer-events-none absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[350px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.06)_0%,transparent_70%)]" />
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-amber-500 mb-3">Get Started</p>
      <h2 className="font-serif text-4xl sm:text-5xl tracking-tight mb-4">
        Ready to{' '}
        <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">forge</span>{' '}
        ahead?
      </h2>
      <p className="text-[#9c9588] max-w-md mx-auto text-base font-light leading-relaxed mb-8">
        Deploy Forge in minutes. Self-hosted, open source, and built for teams who ship fast.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-medium text-white hover:bg-amber-400 transition-all hover:-translate-y-0.5 shadow-[0_0_0_1px_rgba(249,115,22,0.3),0_4px_24px_rgba(249,115,22,0.2)]">
          <Zap className="w-4 h-4" />
          Deploy Now
        </Link>
        <a href="#" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#3d3528] bg-[#1a1815] px-6 py-3 font-medium hover:bg-[#1e1c18] hover:border-[#6b655c] transition-all hover:-translate-y-0.5">
          View on GitHub
        </a>
      </div>
    </section>
  );
}
