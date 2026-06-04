"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HexMark } from "./flow-diagram";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={scrolled ? "nav scrolled" : "nav"}>
      <div className="container nav-inner">
        <Link className="brand" href="/" aria-label="Bumblebee home">
          <span className="mark"><HexMark /></span>
          bumblebee
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <a className="nav-link" href="#features">Features</a>
          <a className="nav-link" href="#how">How it works</a>
          <a className="nav-link" href="#compare">Compare</a>
          <a className="nav-link" href="#pricing">Pricing</a>
          <a className="nav-link" href="https://github.com/lct1407/bumblebee-ai" target="_blank" rel="noreferrer">Docs</a>
        </nav>
        <div className="nav-right">
          <a className="ghstars" href="https://github.com/lct1407/bumblebee-ai" target="_blank" rel="noreferrer" aria-label="GitHub stars">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
            </svg>
            <b>4.2k</b>
          </a>
          <ThemeToggle compact />
          <Link className="btn btn-secondary" href="/login">Sign in</Link>
          <Link className="btn btn-primary" href="/dashboard">Open dashboard</Link>
        </div>
      </div>
    </header>
  );
}
