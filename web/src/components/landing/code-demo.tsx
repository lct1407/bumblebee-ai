"use client";
import { useEffect, useRef, useState } from "react";

type Step = { cmd: string; out: string };

const STEPS: Step[] = [
  { cmd: "pip install bumblebee-ai", out: 'Installing bumblebee-ai-0.4.0 … <span class="ok">done</span>' },
  { cmd: "bumblebee db migrate && bumblebee db seed", out: '<span class="ok">✓</span> 17 tables · 7 agents · 3 workflows' },
  { cmd: "bumblebee server &", out: "INFO  Uvicorn running on http://0.0.0.0:8000" },
  { cmd: "bb issue create 'Add OAuth login' --priority=high", out: '<span class="ok">✓</span> created BB-42: Add OAuth login' },
  { cmd: "bb run trigger 42", out: "▶ triage → plan → 4 specialists → integrate → done" },
];

export function CodeDemo() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);

  // Start typing only when the terminal scrolls into view.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const el = bodyRef.current;
    if (!el) return;
    let idx = 0;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    const line = (html: string) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      el.appendChild(d);
      return d;
    };

    const typeCmd = () => {
      if (cancelled) return;
      if (idx >= STEPS.length) {
        timers.push(setTimeout(() => { el.innerHTML = ""; idx = 0; typeCmd(); }, 4200));
        return;
      }
      const step = STEPS[idx];
      const cmdLine = line(`<div class="cmd"><span class="pmt">$</span><span class="typed"></span><span class="cursor"></span></div>`);
      const typedEl = cmdLine.querySelector(".typed")!;
      const cursorEl = cmdLine.querySelector(".cursor")!;
      let i = 0;
      const tick = setInterval(() => {
        typedEl.textContent = step.cmd.slice(0, ++i);
        if (i >= step.cmd.length) {
          clearInterval(tick);
          cursorEl.remove();
          timers.push(setTimeout(() => {
            line(`<div class="out">${step.out}</div>`);
            idx++;
            timers.push(setTimeout(typeCmd, 520));
          }, 360));
        }
      }, 34);
      intervals.push(tick);
    };

    el.innerHTML = "";
    typeCmd();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [started]);

  return (
    <section className="section-pad" id="quickstart">
      <div className="container" style={{ maxWidth: 880 }}>
        <div className="center-wrap reveal">
          <div className="head center">
            <span className="eyebrow">Quickstart</span>
            <h2 className="h2">Five commands to your first workflow</h2>
            <p className="lead">From a fresh environment to live multi-agent execution.</p>
          </div>
        </div>
        <div className="reveal" style={{ marginTop: 48 }}>
          <div className="term">
            <div className="term-bar">
              <span className="tl"><span /><span /><span /></span>
              <span className="window-title">~/bumblebee-demo</span>
            </div>
            <div className="term-body" ref={bodyRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
