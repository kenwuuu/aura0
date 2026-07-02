/**
 * LandingPage — composition of the marketing sections. Static, responsive,
 * dark-mode only. Every surface reads design tokens (never literal hex).
 */
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { FeatureGrid } from './components/FeatureGrid';
import { MotionShowcase } from './components/MotionShowcase';
import { HowItWorks } from './components/HowItWorks';
import { Cosmetics } from './components/Cosmetics';
import { CtaFooter } from './components/CtaFooter';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <Nav />
      <main>
        <Hero />
        <FeatureGrid />
        <MotionShowcase />
        <HowItWorks />
        <Cosmetics />
        <CtaFooter />
      </main>
    </div>
  );
}
