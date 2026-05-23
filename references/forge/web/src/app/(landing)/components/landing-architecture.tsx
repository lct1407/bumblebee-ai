import { Monitor, Database, Zap } from 'lucide-react';

const clientNodes = [
  { name: 'Desktop', tech: 'Tauri + React', icon: Monitor },
  { name: 'Web', tech: 'Next.js', icon: Monitor },
  { name: 'Mobile', tech: 'React Native', icon: Monitor },
];

const backendNodes = [
  { name: 'MCP Server', color: 'text-amber-400', border: 'hover:border-amber-800' },
  { name: 'REST APIs', color: 'text-amber-400', border: 'hover:border-amber-800' },
  { name: 'WS Server', color: 'text-green-400', border: 'hover:border-green-800' },
  { name: 'Agent Runner', color: 'text-blue-400', border: 'hover:border-blue-800' },
];

export function LandingArchitecture() {
  return (
    <section id="architecture" className="max-w-5xl mx-auto px-6 py-24">
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-amber-500 mb-3">Architecture</p>
      <h2 className="font-serif text-3xl sm:text-4xl tracking-tight mb-12">
        Built for scale. Designed for simplicity.
      </h2>

      <div className="relative rounded-2xl border border-[#2a2720] bg-[#12110f] p-8 sm:p-12">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-700 to-transparent" />

        {/* Client Layer */}
        <div className="mb-3">
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#6b655c]">Client Layer</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {clientNodes.map((c) => (
            <div key={c.name} className="rounded-xl border border-[#2a2720] bg-[#1a1815] p-4 text-center hover:border-[#3d3528] transition-colors">
              <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-[#1e1c18] border border-[#3d3528] flex items-center justify-center">
                <c.icon className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-[10px] text-[#6b655c] mt-0.5 font-mono">{c.tech}</p>
            </div>
          ))}
        </div>

        {/* Connection lines */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="font-mono text-xs text-amber-400">REST API</span>
            <div className="w-16 h-px bg-gradient-to-r from-amber-700 to-amber-900" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-16 h-px bg-gradient-to-r from-green-900 to-green-700" />
            <span className="font-mono text-xs text-green-400">WebSocket</span>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
        </div>

        {/* Backend Layer */}
        <div className="mb-3">
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#6b655c]">Strapi Backend</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {backendNodes.map((s) => (
            <div key={s.name} className={`rounded-xl border border-[#2a2720] bg-[#1e1c18] p-4 text-center ${s.border} transition-colors`}>
              <p className={`text-sm font-medium ${s.color}`}>{s.name}</p>
            </div>
          ))}
        </div>

        {/* Data Layer */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#2a2720] bg-[#1e1c18] p-4 text-center hover:border-amber-800 transition-colors">
            <Database className="w-4 h-4 mx-auto mb-1.5 text-amber-400" />
            <p className="text-sm font-medium text-amber-400">PostgreSQL</p>
            <p className="text-[10px] text-[#6b655c] mt-0.5 font-mono">Data Store</p>
          </div>
          <div className="rounded-xl border border-[#2a2720] bg-[#1e1c18] p-4 text-center hover:border-blue-800 transition-colors">
            <Zap className="w-4 h-4 mx-auto mb-1.5 text-blue-400" />
            <p className="text-sm font-medium text-blue-400">Claude AI</p>
            <p className="text-[10px] text-[#6b655c] mt-0.5 font-mono">Agent Engine</p>
          </div>
        </div>
      </div>
    </section>
  );
}
