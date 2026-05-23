import { features } from '../constants';

export function LandingFeatures() {
  return (
    <section id="features" className="max-w-5xl mx-auto px-6 py-24">
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-amber-500 mb-3">Capabilities</p>
      <h2 className="font-serif text-3xl sm:text-4xl tracking-tight mb-3">
        Everything your team needs,<br />forged into one platform.
      </h2>
      <p className="text-[#9c9588] max-w-lg text-base font-light leading-relaxed mb-12">
        Intelligent issue tracking, autonomous agent execution, and real-time collaboration — unified across desktop, web, and mobile.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 border border-[#2a2720] rounded-2xl overflow-hidden divide-x divide-y divide-[#2a2720]">
        {features.map((f) => (
          <div key={f.title} className="group bg-[#12110f] p-8 hover:bg-[#1a1815] transition-colors relative">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-700 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#1e1c18] border border-[#3d3528] text-amber-400 mb-5 group-hover:border-amber-700 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.1)] transition-all">
              <f.icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-base mb-2">{f.title}</h3>
            <p className="text-sm text-[#9c9588] leading-relaxed font-light">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
