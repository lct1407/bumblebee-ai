const FEATURES = [
  {
    tag: "Concurrency",
    title: "Scope lease",
    body: "Atomic file-glob claims. Two agents can never touch overlapping scopes — guaranteed by the dispatch plane.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
    ),
  },
  {
    tag: "Multi-agent",
    title: "Coordinator pattern",
    body: "A supervisor decomposes complex issues into N specialist sub-tasks, then integrates results on separate branches.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.5 6.5 15.5 11M8.5 17.5 15.5 13" /></svg>
    ),
  },
  {
    tag: "Replayable",
    title: "Event-sourced state",
    body: "An append-only log is the canonical truth. Every LLM call, tool call and decision deterministically replays.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 8v4l3 2" /></svg>
    ),
  },
  {
    tag: "Extensible",
    title: "Plugin ecosystem",
    body: "Ship PyPI packages via entry points. Auto-register workflows, agent prompts, skills and tools.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8h6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-4v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-6H3z" /></svg>
    ),
  },
  {
    tag: "Safety",
    title: "Hard budget ceilings",
    body: "Per-session, per-issue and per-project caps. Loop detector, failure taxonomy and mitigation actuator built in.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v9" /><circle cx="12" cy="12" r="9" /><path d="m16.5 8-3 3" /></svg>
    ),
  },
  {
    tag: "WebSocket",
    title: "Real-time streaming",
    body: "Live event push to your dashboard. Watch agents work in parallel and see decisions land as they happen.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49" /><circle cx="12" cy="12" r="1.5" /></svg>
    ),
  },
];

export function Features() {
  return (
    <section className="section-pad" id="features">
      <div className="container">
        <div className="head reveal">
          <span className="eyebrow">Capabilities</span>
          <h2 className="h2">Built for concurrent autonomy</h2>
          <p className="lead">
            Seven architectural planes. Every decision recorded, every agent bounded, every workflow replayable.
          </p>
        </div>
        <div className="fgrid">
          {FEATURES.map((f) => (
            <div className="fcell reveal" key={f.title}>
              <div className="ficon">{f.icon}</div>
              <div className="tag">{f.tag}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
