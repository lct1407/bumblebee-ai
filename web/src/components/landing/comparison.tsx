function Yes() {
  return <svg className="yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="m5 13 4 4L19 7" /></svg>;
}
function No() {
  return <svg className="no" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

const ROWS: { feat: string; own: string; val: string }[] = [
  { feat: "Concurrent agents per issue", own: "Native, scope-leased", val: "One at a time" },
  { feat: "File-collision safety", own: "Atomic leases", val: "Manual / none" },
  { feat: "Deterministic replay", own: "Event-sourced", val: "Logs only" },
  { feat: "Budget ceilings", own: "Hard caps + loop detector", val: "Best effort" },
  { feat: "Self-hostable & open source", own: "MIT, Python-native", val: "Mostly SaaS-only" },
];

export function Comparison() {
  return (
    <section className="section-pad" id="compare">
      <div className="container" style={{ maxWidth: 920 }}>
        <div className="center-wrap reveal">
          <div className="head center">
            <span className="eyebrow">Why Bumblebee</span>
            <h2 className="h2">Not another single-agent wrapper</h2>
          </div>
        </div>
        <div className="cmp reveal">
          <div className="cmp-row cmp-head">
            <div className="feat">Capability</div>
            <div className="own">Bumblebee</div>
            <div className="val">Typical AI tools</div>
          </div>
          {ROWS.map((r) => (
            <div className="cmp-row" key={r.feat}>
              <div className="feat">{r.feat}</div>
              <div className="own"><Yes />{r.own}</div>
              <div className="val"><No />{r.val}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
