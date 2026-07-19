import type { Metadata } from "next";
import { Cta } from "@/components/marketing/cta";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { FeaturesAi } from "@/components/marketing/features-ai";
import { FeaturesBoard } from "@/components/marketing/features-board";
import { FeaturesIssues } from "@/components/marketing/features-issues";
import { FeaturesKeyboard } from "@/components/marketing/features-keyboard";
import { Footer } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/hero";
import { LogoCloud } from "@/components/marketing/logo-cloud";
import { Testimonials } from "@/components/marketing/testimonials";

export const metadata: Metadata = {
  title: "Perplexed — The issue tracker built for speed",
  description:
    "Plan, track, and ship with issues, boards, and cycles in a keyboard-first workspace — with an AI agent that handles the busywork. Free for teams of 3.",
};

export default function LandingPage() {
  return (
    <>
      <main>
        <Hero />
        <LogoCloud />
        <FeaturesIssues />
        <FeaturesBoard />
        <FeaturesAi />
        <FeaturesKeyboard />
        <FeatureGrid />
        <Testimonials />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
