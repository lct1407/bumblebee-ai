const STATS = [
  { num: "96", lab: "Tests passing", sub: "across 12 modules" },
  { num: "7", lab: "Architecture planes", sub: "clean separation" },
  { num: "13", lab: "Single-verb tools", sub: "strict JSON schemas" },
  { num: "14", lab: "Core entities", sub: "fully event-sourced" },
];

export function StatsCounter() {
  return (
    <section className="section-pad" style={{ paddingBlock: 64 }}>
      <div className="container">
        <div className="stats reveal">
          {STATS.map((s) => (
            <div className="stat" key={s.lab}>
              <div className="num">{s.num}</div>
              <div className="lab">{s.lab}</div>
              <div className="sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
