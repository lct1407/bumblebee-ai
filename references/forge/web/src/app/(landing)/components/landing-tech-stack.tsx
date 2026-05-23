import { techStack } from '../constants';

export function LandingTechStack() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-amber-500 mb-3">Tech Stack</p>
      <h2 className="font-serif text-3xl sm:text-4xl tracking-tight mb-3">Built with the best.</h2>
      <p className="text-[#9c9588] text-base font-light mb-10">TypeScript everywhere. Battle-tested frameworks. Production-ready from day one.</p>

      <div className="flex flex-wrap justify-center gap-3">
        {techStack.map((t) => (
          <div key={t.name} className="inline-flex items-center gap-2.5 rounded-xl bg-[#1a1815] border border-[#2a2720] px-4 py-2.5 text-sm font-medium hover:border-[#3d3528] hover:-translate-y-0.5 transition-all cursor-default">
            <span className="w-2 h-2 rounded-sm" style={{ background: t.color }} />
            {t.name}
          </div>
        ))}
      </div>
    </section>
  );
}
