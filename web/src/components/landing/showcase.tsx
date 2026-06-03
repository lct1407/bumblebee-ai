function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 13 4 4L19 7" /></svg>
  );
}

export function Showcase() {
  return (
    <section className="section-pad">
      <div className="container" style={{ display: "grid", gap: 120 }}>
        {/* Row 1 — specialists */}
        <div className="split reveal">
          <div className="split-media">
            <div className="window">
              <div className="window-bar">
                <span className="tl"><span /><span /><span /></span>
                <span className="window-title">specialists · BB-42</span>
              </div>
              <div style={{ padding: 18, background: "var(--bg-canvas)", display: "grid", gap: 10 }}>
                {[
                  ["worktree/oauth-routes", "Auth endpoints", "run", "running"],
                  ["worktree/oauth-ui", "Login screen", "run", "running"],
                  ["worktree/oauth-tests", "E2E coverage", "agent", "queued"],
                  ["worktree/oauth-docs", "Setup guide", "run", "running"],
                ].map(([key, title, chip, label]) => (
                  <div className="tcard" key={key} style={{ margin: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div className="key">{key}</div>
                      <div className="ttl" style={{ margin: "2px 0 0" }}>{title}</div>
                    </div>
                    <span className={`chip ${chip}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <span className="eyebrow">Multi-agent collaboration</span>
            <h3 className="h2" style={{ margin: "14px 0 0", fontSize: "clamp(24px, 2.6vw, 32px)" }}>
              N specialists. One issue. Parallel execution.
            </h3>
            <p className="lead" style={{ marginTop: 14 }}>
              The coordinator decomposes complex issues into disjoint sub-tasks. Each specialist gets
              its own git worktree and scope lease; branches integrate cleanly via a dedicated
              integrator role.
            </p>
            <ul className="bullets">
              <li><Check />Coordinator supervisor pattern</li>
              <li><Check />Per-specialist git worktree</li>
              <li><Check />Atomic scope lease — no merge conflicts</li>
              <li><Check />Real-time event stream via WebSocket</li>
            </ul>
          </div>
        </div>

        {/* Row 2 — scope lease */}
        <div className="split rev reveal">
          <div className="split-media">
            <div className="window">
              <div className="window-bar">
                <span className="tl"><span /><span /><span /></span>
                <span className="window-title">scope-lease · dispatch plane</span>
              </div>
              <div style={{ padding: 20, background: "var(--bg-canvas)", display: "grid", gap: 12 }}>
                <div className="tcard" style={{ margin: 0, borderColor: "var(--accent-border)", boxShadow: "0 0 0 3px var(--accent-subtle)" }}>
                  <div className="trow">
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--accent-press)" }}>claim: src/auth/**</span>
                    <span className="chip agent">held · agent-1</span>
                  </div>
                </div>
                <div className="tcard" style={{ margin: 0 }}>
                  <div className="trow">
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>claim: src/ui/login/**</span>
                    <span className="chip run">held · agent-2</span>
                  </div>
                </div>
                <div className="tcard" style={{ margin: 0, opacity: 0.65 }}>
                  <div className="trow">
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>claim: src/auth/oauth.py</span>
                    <span className="chip gray">queued · conflict</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 8, alignItems: "center", paddingTop: 2 }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  Overlapping claim detected — second agent waits
                </div>
              </div>
            </div>
          </div>
          <div>
            <span className="eyebrow">File-level safety</span>
            <h3 className="h2" style={{ margin: "14px 0 0", fontSize: "clamp(24px, 2.6vw, 32px)" }}>
              Agents can never collide.
            </h3>
            <p className="lead" style={{ marginTop: 14 }}>
              Before touching code, every agent acquires an atomic claim on its file-glob patterns.
              Two agents requesting overlapping scopes? The second queues. No race conditions, no
              mid-merge corruption.
            </p>
            <ul className="bullets">
              <li><Check />Atomic claims with <span className="mono" style={{ fontSize: 13 }}>PG SKIP LOCKED</span></li>
              <li><Check />Heartbeat-refreshed, auto-expiring leases</li>
              <li><Check />Conflict detection via file-set intersection</li>
              <li><Check />Revocable on emergency by the coordinator</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
