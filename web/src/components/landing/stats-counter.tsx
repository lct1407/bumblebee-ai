"use client";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef } from "react";

function AnimatedCounter({ from = 0, to, suffix = "" }: { from?: number; to: number; suffix?: string }) {
  const count = useMotionValue(from);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString() + suffix);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) {
      const controls = animate(count, to, { duration: 2, ease: "easeOut" });
      return () => controls.stop();
    }
  }, [inView, count, to]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}

const STATS = [
  { value: 96, suffix: "", label: "Tests passing", sub: "across 12 modules" },
  { value: 7, suffix: "", label: "Architecture planes", sub: "clean separation of concerns" },
  { value: 13, suffix: "", label: "Single-verb tools", sub: "with strict JSON schemas" },
  { value: 14, suffix: "", label: "Production entities", sub: "fully event-sourced" },
];

export function StatsCounter() {
  return (
    <section className="bg-black text-white py-20 relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="text-center group"
            >
              <div className="text-5xl md:text-6xl font-bold text-gradient">
                <AnimatedCounter to={s.value} suffix={s.suffix} />
              </div>
              <div className="mt-3 text-zinc-300 font-semibold">{s.label}</div>
              <div className="mt-1 text-xs text-zinc-500">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
