import Link from "next/link";
import { HexMark } from "./flow-diagram";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link className="brand" href="/">
              <span className="mark" style={{ color: "var(--accent)" }}><HexMark /></span>
              bumblebee
            </Link>
            <p className="text-tertiary" style={{ fontSize: 13.5, maxWidth: "34ch", marginTop: 14 }}>
              The open-source platform for multiple AI agents working concurrently on one project.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="https://github.com/lct1407/bumblebee/blob/master/CHANGELOG.md" target="_blank" rel="noreferrer">Changelog</a>
          </div>
          <div>
            <h4>Developers</h4>
            <a href="https://github.com/lct1407/bumblebee-ai" target="_blank" rel="noreferrer">Documentation</a>
            <a href="https://pypi.org/project/bumblebee-ai/" target="_blank" rel="noreferrer">PyPI package</a>
            <Link href="/dashboard">Dashboard</Link>
            <a href="https://github.com/lct1407/bumblebee" target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <a href="mailto:hello@bumblebee.ai">Contact</a>
          </div>
        </div>
        <div className="footer-bot">
          <span>© 2026 Bumblebee. MIT licensed.</span>
          <span className="mono" style={{ fontSize: 12 }}>v0.4.0</span>
        </div>
      </div>
    </footer>
  );
}
