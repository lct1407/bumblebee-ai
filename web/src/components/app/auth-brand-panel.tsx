import Link from "next/link";
import { HexMark } from "@/components/ui/hex-mark";

const POINTS = [
  "Scope-leased file safety — no merge collisions",
  "Event-sourced state, deterministically replayable",
  "Hard budget ceilings + loop detection",
];

/* The one place a subtle accent wash + dot grid is allowed (editorial brand panel). */
export function BrandPanel() {
  return (
    <div
      className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
      style={{ background: "var(--bg-inset)", borderRight: "1px solid var(--border)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(60% 50% at 25% 0%, var(--accent-subtle), transparent 70%)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.5,
          WebkitMaskImage: "radial-gradient(80% 70% at 30% 30%, #000, transparent 75%)",
          maskImage: "radial-gradient(80% 70% at 30% 30%, #000, transparent 75%)",
        }}
      />

      <Link href="/" className="relative flex items-center gap-2.5">
        <span style={{ color: "var(--accent)" }}><HexMark size={28} /></span>
        <span className="font-semibold text-lg tracking-tight" style={{ color: "var(--text-primary)" }}>bumblebee</span>
      </Link>

      <div className="relative">
        <div className="t-overline mb-4" style={{ color: "var(--accent)" }}>Multi-agent orchestration</div>
        <h2 className="font-semibold" style={{ fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.05, letterSpacing: "-0.035em", color: "var(--text-primary)" }}>
          The task tracker that does the work itself.
        </h2>
        <p className="mt-5 max-w-md" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
          A coordinator decomposes each issue, leases file scopes to parallel specialists, and
          integrates the result — every decision recorded and replayable.
        </p>
        <ul className="mt-8 space-y-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" style={{ color: "var(--accent)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative t-small" style={{ color: "var(--text-tertiary)" }}>
        MIT licensed · self-host or cloud · no credit card
      </div>
    </div>
  );
}
