import {
  LandingNav,
  LandingHero,
  LandingFeatures,
  LandingWorkflow,
  LandingArchitecture,
  LandingTechStack,
  LandingCta,
  LandingFooter,
} from './components';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0908] text-[#f0ebe3]">
      <LandingNav />
      <LandingHero />
      <LandingFeatures />
      <LandingWorkflow />
      <LandingArchitecture />
      <LandingTechStack />
      <LandingCta />
      <LandingFooter />
    </div>
  );
}
