import { steps } from '../constants';

export function LandingWorkflow() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-amber-500 mb-3">Workflow</p>
      <h2 className="font-serif text-3xl sm:text-4xl tracking-tight mb-3">
        Issue to resolution. <em className="font-serif text-amber-400">Automated.</em>
      </h2>
      <p className="text-[#9c9588] text-base font-light mb-16">Four steps. Minimal human intervention. Maximum velocity.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
        {/* Connector line */}
        <div className="hidden lg:block absolute top-8 left-[12%] right-[12%] h-px bg-[#3d3528]" />

        {steps.map((s) => (
          <div key={s.num} className="group text-center">
            <div className="relative z-10 w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center bg-[#1a1815] border border-[#3d3528] font-serif text-xl text-amber-400 group-hover:border-amber-600 group-hover:shadow-[0_0_30px_rgba(249,115,22,0.15)] transition-all">
              {s.num}
            </div>
            <h3 className="font-semibold mb-2">{s.title}</h3>
            <p className="text-sm text-[#9c9588] font-light leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
