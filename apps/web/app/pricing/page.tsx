import type { Metadata } from "next";
import { getPublicCapacitySummary } from "@/lib/intake";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  PricingSection,
  StatsSection,
  TestimonialsSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "Pricing: Essentials $500 / Premium $1,000 + 5% Success Fee";
const description =
  "Transparent JobGenius pricing. Essentials at $500 or Premium at $1,000 registration fee, payable in up to 3 installments. 5% success commission only after you accept an offer — no offer, no commission.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title, description, url: "/pricing", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export const dynamic = "force-dynamic";

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "JobGenius Managed Job Search",
  description,
  brand: { "@type": "Brand", name: "JobGenius" },
  offers: [
    {
      "@type": "Offer",
      name: "Essentials",
      description:
        "Unlimited job applications, up to 20 referral outreaches, dedicated account manager, resume optimization, portal access.",
      price: "500",
      priceCurrency: "USD",
      url: "https://job-genius.com/pricing",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Premium",
      description:
        "Unlimited applications + unlimited referral outreaches, priority network access, AI interview coaching with voice practice, full account manager support.",
      price: "1000",
      priceCurrency: "USD",
      url: "https://job-genius.com/pricing",
      availability: "https://schema.org/InStock",
    },
  ],
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Pricing", path: "/pricing" },
]);

export default async function PricingPage() {
  const capacitySummary = await getPublicCapacitySummary();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="Pricing"
        title="Pay once, get hired, owe a small success fee"
        subtitle="One registration fee covers the strategy, applications, and outreach. A 5% success commission is only ever due after you accept an offer — never before."
        secondaryCta={{ href: "/how-it-works", label: "How It Works" }}
      />
      <PricingSection capacitySummary={capacitySummary} />
      <StatsSection />
      <TestimonialsSection />
      <FinalCtaSection capacitySummary={capacitySummary} />
    </MarketingShell>
  );
}
