import Link from "next/link";

function Check() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="m5 13 4 4L19 7" /></svg>;
}

const TIERS = [
  {
    name: "Open Source",
    desc: "Self-hosted core, MIT licensed.",
    amt: "$0",
    note: "forever",
    featured: false,
    cta: "Read the docs",
    href: "https://github.com/lct1407/bumblebee-ai",
    external: true,
    features: ["Unlimited agents & projects", "Scope-lease & event store", "Plugin SDK", "Community support"],
  },
  {
    name: "Team",
    desc: "Managed orchestration for growing teams.",
    amt: "$49",
    amtSmall: " / seat / mo",
    note: "billed annually",
    featured: true,
    cta: "Start free trial",
    href: "/register?plan=team",
    external: false,
    features: ["Everything in Open Source", "Managed runners & autoscale", "Org budget ceilings & SSO", "Priority support"],
  },
  {
    name: "Enterprise",
    desc: "Compliance, scale and dedicated support.",
    amt: "Custom",
    note: "talk to us",
    featured: false,
    cta: "Contact sales",
    href: "mailto:sales@bumblebee.ai",
    external: true,
    features: ["Everything in Team", "On-prem / VPC deployment", "Audit log & SOC 2", "Dedicated success engineer"],
  },
];

export function Pricing() {
  return (
    <section className="section-pad" id="pricing">
      <div className="container">
        <div className="center-wrap reveal">
          <div className="head center">
            <span className="eyebrow">Pricing</span>
            <h2 className="h2">Start free. Scale when you do.</h2>
            <p className="lead">
              Self-host the open-source core forever. Upgrade for managed orchestration and team controls.
            </p>
          </div>
        </div>
        <div className="prices">
          {TIERS.map((t) => (
            <div className={t.featured ? "price feat reveal" : "price reveal"} key={t.name}>
              {t.featured ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="pname">{t.name}</div>
                  <span className="ptag">Popular</span>
                </div>
              ) : (
                <div className="pname">{t.name}</div>
              )}
              <div className="pdesc">{t.desc}</div>
              <div className="amt">{t.amt}{t.amtSmall && <small>{t.amtSmall}</small>}</div>
              <div className="text-tertiary" style={{ fontSize: 13 }}>{t.note}</div>
              <ul className="plist">
                {t.features.map((f) => (
                  <li key={f}><Check />{f}</li>
                ))}
              </ul>
              {t.external ? (
                <a className={t.featured ? "btn btn-primary" : "btn btn-secondary"} href={t.href} target="_blank" rel="noreferrer">{t.cta}</a>
              ) : (
                <Link className={t.featured ? "btn btn-primary" : "btn btn-secondary"} href={t.href}>{t.cta}</Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
