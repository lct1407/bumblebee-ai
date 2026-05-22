"use client";
import { motion } from "framer-motion";

const QUOTES = [
  {
    quote:
      "We replaced our internal task router with Bumblebee in a weekend. The scope-lease primitive saved us from a class of race conditions we'd been fighting for months.",
    author: "Engineering Lead",
    role: "Stealth-mode AI startup",
    avatar: "🐝",
  },
  {
    quote:
      "Multi-agent on the same codebase finally works. We have 4 specialists running in parallel on different modules — and they actually integrate cleanly.",
    author: "Staff Engineer",
    role: "DevTool company (Series B)",
    avatar: "🔬",
  },
  {
    quote:
      "Plugin distribution via pypi was the killer feature. We shipped a deploy automation plugin in 2 days and our SRE team adopted it instantly.",
    author: "Platform Lead",
    role: "Fortune 500 retail",
    avatar: "🚀",
  },
];

export function Testimonials() {
  return (
    <section className="bg-gradient-to-b from-zinc-950 to-black text-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold">
            Trusted by <span className="text-gradient">engineers shipping AI</span>
          </h2>
          <p className="mt-4 text-zinc-400">Early adopters running real multi-agent workloads.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {QUOTES.map((q, i) => (
            <motion.figure
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950 p-8 relative"
            >
              <svg className="absolute top-6 left-6 w-10 h-10 text-amber-500/20" fill="currentColor" viewBox="0 0 32 32">
                <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
              </svg>
              <blockquote className="pt-6 text-zinc-200 leading-relaxed">"{q.quote}"</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-purple-500/30 flex items-center justify-center text-xl">
                  {q.avatar}
                </div>
                <div>
                  <div className="font-semibold text-white">{q.author}</div>
                  <div className="text-xs text-zinc-500">{q.role}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center mt-12 text-xs text-zinc-600"
        >
          * Testimonials illustrate target user stories. Real case studies coming with v1.0 release.
        </motion.p>
      </div>
    </section>
  );
}
