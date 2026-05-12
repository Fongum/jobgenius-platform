import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  HowItWorksSection,
  AiHumanSection,
  StatsSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "How JobGenius Works: AI + Human Account Manager Job Search";
const description =
  "See exactly how JobGenius runs your job search end-to-end. AI finds and matches roles 24/7 while a dedicated human account manager applies, reaches out to recruiters, and preps you for interviews.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title,
    description,
    url: "/how-it-works",
    type: "article",
  },
  twitter: { card: "summary_large_image", title, description },
};

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How JobGenius runs your job search",
  description,
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "You tell us what you want",
      text: "Upload your resume, share your target roles, salary range, and preferences. Your account manager reviews everything and builds a personalized search strategy.",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "We work while you don't",
      text: "Our AI finds and matches opportunities 24/7. Your account manager applies, reaches out to recruiters, taps the referral network, and manages your entire pipeline.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "You focus on interviews",
      text: "When an interview lands, we prepare you with AI-powered coaching, company-specific questions, and practice sessions so you walk in confident and ready.",
    },
  ],
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "How It Works", path: "/how-it-works" },
]);

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="How It Works"
        title="Three steps from sign-up to signed offer"
        subtitle="JobGenius pairs always-on AI with a dedicated human account manager. You tell us what you want; we run the entire search end-to-end."
        secondaryCta={{ href: "/pricing", label: "See Pricing" }}
      />
      <HowItWorksSection />
      <AiHumanSection />
      <StatsSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
