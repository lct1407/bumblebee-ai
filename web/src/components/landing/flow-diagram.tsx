/* Coordinator → specialists → integrator flow diagram (replaces AI art).
   Data-driven: edit SPECIALISTS to change the parallel fan-out. */
export { HexMark } from "@/components/ui/hex-mark";

const SPECIALISTS: [string, string][] = [
  ["Auth routes", "src/auth/**"],
  ["Login UI", "src/ui/login/**"],
  ["E2E tests", "tests/oauth/**"],
  ["Setup docs", "docs/auth.md"],
];

function ArrowRight() {
  return (
    <svg className="flow-arrow" viewBox="0 0 40 24" width="34" height="20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 12h32" />
      <path d="m28 6 7 6-7 6" />
    </svg>
  );
}

function Node({ label, sub, accent }: { label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={accent ? "node accent" : "node"}>
      <div className="nlab">{label}</div>
      {sub && <div className="nsub">{sub}</div>}
    </div>
  );
}

export function FlowDiagram() {
  return (
    <div className="flow-stage">
      <div className="flow-col">
        <div className="flow-cap">Issue</div>
        <Node label="BB-42" sub="Add OAuth login" accent />
      </div>
      <ArrowRight />
      <div className="flow-col">
        <div className="flow-cap">Coordinator</div>
        <Node label="Decompose" sub="supervisor" />
      </div>
      <ArrowRight />
      <div className="flow-col grow">
        <div className="flow-cap">Specialists · parallel</div>
        <div className="flow-spec">
          {SPECIALISTS.map(([label, sub]) => (
            <Node key={label} label={label} sub={sub} />
          ))}
        </div>
      </div>
      <ArrowRight />
      <div className="flow-col">
        <div className="flow-cap">Integrator</div>
        <Node label="Merge" sub="clean branches" />
      </div>
      <ArrowRight />
      <div className="flow-col">
        <div className="flow-cap">Result</div>
        <Node label="Done" sub="reviewed · merged" accent />
      </div>
    </div>
  );
}
