"use client";
import { useEffect } from "react";

/** Observes every `.reveal` inside the landing and slides it into rest.
    Transform-only — content is visible even if this never runs. */
export function RevealObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lp .reveal"));
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));

    // Failsafe: snap anything already in view to rest if the observer misses.
    const t = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".lp .reveal:not(.in)").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
      });
    }, 400);

    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);

  return null;
}
