import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MarketingShell from "./components/MarketingShell";
import { FAQS } from "./components/faqs";
import {
  HeroSection,
  CompaniesStrip,
  PainPointSection,
  HowItWorksSection,
  WhatWeDoSection,
  StatsSection,
  AiHumanSection,
  InterviewPrepSection,
  ReferralSection,
  NetworkSection,
  PricingSection,
  TestimonialsSection,
  FaqSection,
  FinalCtaSection,
} from "./components/homepage";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function HomePage() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("jg_access_token")?.value;
  const userType = cookieStore.get("jg_user_type")?.value;

  if (accessToken) {
    if (userType === "job_seeker") {
      redirect("/portal");
    }
    redirect("/dashboard");
  }

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HeroSection />
      <CompaniesStrip />
      <PainPointSection />
      <HowItWorksSection />
      <WhatWeDoSection />
      <StatsSection />
      <AiHumanSection />
      <InterviewPrepSection />
      <ReferralSection />
      <NetworkSection />
      <PricingSection />
      <TestimonialsSection />
      <FaqSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
