"use client";
import { motion } from "framer-motion";

type Status = boolean | "partial";
type Row = { feature: string; bb: Status; gpts: Status; langgraph: Status; crew: Status };

const ROWS: Row[] = [
  { feature: "Multi-agent concurrent on same project", bb: true, gpts: false, langgraph: "partial", crew: "partial" },
  { feature: "Scope-leased file safety (no merge conflicts)", bb: true, gpts: false, langgraph: false, crew: false },
  { feature: "Event-sourced state (replay-able)", bb: true, gpts: false, langgraph: "partial", crew: false },
  { feature: "Plugin system (pip install plugins)", bb: true, gpts: false, langgraph: false, crew: false },
  { feature: "Per-session + per-issue + per-project budget caps", bb: true, gpts: false, langgraph: false, crew: "partial" },
  { feature: "Failure taxonomy with auto-mitigation", bb: true, gpts: false, langgraph: false, crew: false },
  { feature: "Real-time WebSocket event stream", bb: true, gpts: false, langgraph: false, crew: false },
  { feature: "MIT license + self-hostable", bb: true, gpts: false, langgraph: true, crew: true },
];

const Mark = ({ status }: { status: boolean | "partial" }) => {
  if (status === true)
    return (
      <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    );
  if (status === "partial")
    return <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-bold">~</span>;
  return (
    <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-600">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </span>
  );
};

export function Comparison() {
  return (
    <section className="bg-zinc-950 text-white py-24" id="comparison">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold">
            How <span className="text-gradient">Bumblebee</span> compares
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            Other agent frameworks focus on single-agent autonomy. Bumblebee is purpose-built for
            multi-agent collaboration on the same codebase.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="overflow-x-auto rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/60 to-zinc-950"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-black/40">
                <th className="text-left px-6 py-5 font-semibold text-zinc-400 uppercase tracking-widest text-xs">Feature</th>
                <th className="px-4 py-5 font-bold text-amber-400">Bumblebee</th>
                <th className="px-4 py-5 text-zinc-400 font-medium">GPTs</th>
                <th className="px-4 py-5 text-zinc-400 font-medium">LangGraph</th>
                <th className="px-4 py-5 text-zinc-400 font-medium">CrewAI</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="border-b border-zinc-900 hover:bg-zinc-900/40 transition"
                >
                  <td className="px-6 py-4 text-zinc-200">{row.feature}</td>
                  <td className="px-4 py-4 text-center"><Mark status={row.bb} /></td>
                  <td className="px-4 py-4 text-center"><Mark status={row.gpts} /></td>
                  <td className="px-4 py-4 text-center"><Mark status={row.langgraph} /></td>
                  <td className="px-4 py-4 text-center"><Mark status={row.crew} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <div className="mt-6 flex justify-center gap-8 text-xs text-zinc-500">
          <span className="flex items-center gap-2"><Mark status={true} /> Native</span>
          <span className="flex items-center gap-2"><Mark status="partial" /> Partial / SDK</span>
          <span className="flex items-center gap-2"><Mark status={false} /> Not supported</span>
        </div>
      </div>
    </section>
  );
}
