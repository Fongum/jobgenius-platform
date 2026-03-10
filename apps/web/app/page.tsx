import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MobileNav from "./components/MobileNav";
import StickyCta from "./components/StickyCta";
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
  Footer,
} from "./components/homepage";

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
    <div className="min-h-screen bg-white">
      <StickyCta />

      {/* ─── HEADER ─── */}
      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="JobGenius" width={140} height={40} className="h-9 w-auto" priority />
            </Link>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How It Works</a>
              <a href="#what-we-do" className="hover:text-gray-900 transition-colors">What We Do</a>
              <a href="#referral-network" className="hover:text-gray-900 transition-colors">Referral Network</a>
              <a href="#interview-prep" className="hover:text-gray-900 transition-colors">Interview Prep</a>
              <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="bg-orange-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
              >
                Get Started
              </Link>
              <MobileNav />
            </div>
          </nav>
        </div>
      </header>

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
      <Footer />
    </div>
  );
}
