import { Hero } from "@/components/landing/hero";
import { StatsCounter } from "@/components/landing/stats-counter";
import { Features } from "@/components/landing/features";
import { Showcase } from "@/components/landing/showcase";
import { Architecture } from "@/components/landing/architecture";
import { CodeDemo } from "@/components/landing/code-demo";
import { Comparison } from "@/components/landing/comparison";
import { UseCases } from "@/components/landing/use-cases";
import { Integrations } from "@/components/landing/integrations";
import { Testimonials } from "@/components/landing/testimonials";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
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
    <>
      <Hero />
      <StatsCounter />
      <Features />
      <Showcase />
      <Architecture />
      <CodeDemo />
      <Comparison />
      <UseCases />
      <Integrations />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </>
  );
}
