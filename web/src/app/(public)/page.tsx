import { SiteNav } from "@/components/landing/site-nav";
import { RevealObserver } from "@/components/landing/reveal-observer";
import { Hero } from "@/components/landing/hero";
import { StatsCounter } from "@/components/landing/stats-counter";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Showcase } from "@/components/landing/showcase";
import { CodeDemo } from "@/components/landing/code-demo";
import { Comparison } from "@/components/landing/comparison";
import { Pricing } from "@/components/landing/pricing";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "Bumblebee — Multi-Agent Concurrent Task Management",
  description:
    "The open-source AI task orchestration platform. Multiple AI agents working concurrently on the same project. LangGraph orchestration, scope-leased file safety, event-sourced state, plugin-ready.",
  openGraph: {
    title: "Bumblebee — Multi-Agent Concurrent Task Management",
    description: "Multiple AI agents. One project. Together. LangGraph orchestration + scope-leased file safety + event-sourced state.",
    images: ["/images/og-social.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bumblebee — Multi-Agent Concurrent Task Management",
    description: "Multiple AI agents. One project. Together.",
    images: ["/images/og-social.png"],
  },
};

export default function Landing() {
  return (
    <div className="lp">
      <SiteNav />
      <main id="top">
        <Hero />
        <StatsCounter />
        <hr className="divider" />
        <Features />
        <hr className="divider" />
        <HowItWorks />
        <hr className="divider" />
        <Showcase />
        <hr className="divider" />
        <CodeDemo />
        <hr className="divider" />
        <Comparison />
        <hr className="divider" />
        <Pricing />
        <CTA />
      </main>
      <Footer />
      <RevealObserver />
    </div>
  );
}
