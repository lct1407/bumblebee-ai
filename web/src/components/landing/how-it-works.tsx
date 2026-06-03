import { FlowDiagram } from "./flow-diagram";

export function HowItWorks() {
  return (
    <section className="section-pad" id="how">
      <div className="container">
        <div className="head reveal">
          <span className="eyebrow">How it works</span>
          <h2 className="h2">One issue, decomposed and integrated</h2>
          <p className="lead">
            The coordinator turns a complex issue into disjoint, scope-leased sub-tasks. Specialists
            run in parallel on their own worktrees; an integrator merges cleanly.
          </p>
        </div>
        <div className="flow reveal" style={{ overflowX: "auto" }}>
          <FlowDiagram />
        </div>
      </div>
    </section>
  );
}
