"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";

const SHOWCASE = [
  {
    img: "/images/feature-multi-agent.png",
    alt: "Multiple AI agents collaborating on a shared codebase",
    badge: "Multi-Agent Collaboration",
    title: "N specialists. One issue. Parallel execution.",
    body: "Coordinator agent decomposes Complex issues into disjoint sub-tasks. Each specialist gets its own git worktree branch + scope lease. Branches integrate cleanly via a dedicated Integrator role.",
    bullets: [
      "Coordinator (supervisor pattern)",
      "Per-specialist git worktree",
      "Atomic scope lease — no merge conflicts",
      "Real-time event stream via WebSocket",
    ],
  },
  {
    img: "/images/feature-scope-lease.png",
    alt: "Scope lease shield protecting file access",
    badge: "File-Level Safety",
    title: "ScopeLease — agents can never collide.",
    body: "Before touching code, every agent acquires an atomic claim on its file glob patterns. Two agents requesting overlapping scopes? The second one queues. No race conditions. No mid-merge corruption.",
    bullets: [
      "Atomic file-glob claims with PG SKIP LOCKED",
      "Heartbeat-refreshed leases (auto-expire stale)",
      "Conflict detection via file-set intersection",
      "Revocable on emergency by Coordinator",
    ],
    reverse: true,
  },
];

export function Showcase() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    ref.current?.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="relative bg-black text-white py-24" id="showcase">
      <div ref={ref} className="max-w-6xl mx-auto px-6 space-y-32">
        {SHOWCASE.map((s, i) => (
          <div
            key={i}
            className={`reveal grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${s.reverse ? "lg:[direction:rtl]" : ""}`}
          >
            <div className="relative lg:[direction:ltr]">
              <div className="absolute -inset-4 bg-gradient-to-br from-amber-500/20 via-purple-500/10 to-transparent blur-2xl rounded-3xl" />
              <div className="relative rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
                <Image
                  src={s.img}
                  alt={s.alt}
                  width={1024}
                  height={1024}
                  className="w-full h-auto"
                  priority={i === 0}
                />
              </div>
            </div>
            <div className="lg:[direction:ltr]">
              <div className="inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium mb-4">
                {s.badge}
              </div>
              <h3 className="text-3xl sm:text-4xl font-bold leading-tight">{s.title}</h3>
              <p className="mt-4 text-lg text-zinc-400">{s.body}</p>
              <ul className="mt-6 space-y-2">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-zinc-300">
                    <svg
                      className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
