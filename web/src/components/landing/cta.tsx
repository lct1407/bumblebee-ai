import Link from "next/link";

export function CTA() {
  return (
    <section className="section-pad">
      <div className="container">
        <div className="cta-box reveal">
          <div className="dotgrid" />
          <div className="cta-inner">
            <h2 className="h2" style={{ maxWidth: "18ch", marginInline: "auto" }}>
              Put a fleet of agents on your backlog.
            </h2>
            <p className="lead" style={{ maxWidth: "48ch", margin: "16px auto 0" }}>
              Open-source, self-hostable, and production-ready. Install it in under a minute.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 28 }}>
              <Link className="btn btn-primary btn-lg" href="/dashboard">
                Open dashboard
                <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a className="btn btn-secondary btn-lg mono" href="https://pypi.org/project/bumblebee-ai/" target="_blank" rel="noreferrer">
                pip install bumblebee-ai
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
