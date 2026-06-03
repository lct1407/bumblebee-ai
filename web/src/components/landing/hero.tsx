import Link from "next/link";
import { FlowDiagram } from "./flow-diagram";

export function Hero() {
  return (
    <section className="hero section-pad">
      <div className="hero-wash" />
      <div className="dotgrid" />
      <div className="container" style={{ textAlign: "center" }}>
        <div className="reveal" style={{ maxWidth: 800, marginInline: "auto" }}>
          <span className="pill" style={{ marginInline: "auto" }}>
            <span className="dot" />
            <span className="ver">v0.4.0</span>
            <span className="sep" />
            LangGraph orchestration
          </span>
          <h1 className="display" style={{ margin: "24px 0 0" }}>
            The task tracker that
            <br />
            does the work itself.
          </h1>
          <p className="lead" style={{ margin: "20px auto 0", maxWidth: "56ch" }}>
            Create an issue. A coordinator decomposes it, leases file scopes to parallel
            specialists, and integrates the result — every decision recorded and replayable.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
            <Link className="btn btn-primary btn-lg" href="/dashboard">
              Start free
              <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a className="btn btn-secondary btn-lg" href="https://github.com/lct1407/bumblebee-ai" target="_blank" rel="noreferrer">
              Read the docs
            </a>
          </div>
        </div>

        <div className="reveal" style={{ marginTop: 56 }}>
          <div className="window" style={{ maxWidth: 960, marginInline: "auto" }}>
            <div className="window-bar">
              <span className="tl"><span /><span /><span /></span>
              <span className="window-title">workflow · BB-42 &ldquo;Add OAuth login&rdquo;</span>
            </div>
            <div style={{ padding: "34px 28px", background: "var(--bg-inset)", overflowX: "auto" }}>
              <FlowDiagram />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
