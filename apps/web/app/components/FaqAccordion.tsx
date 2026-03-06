"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "What if I don't land a job?",
    a: "Your registration fee covers the work we do on your behalf — building your search strategy, running applications, and recruiter outreach. If you don't receive an accepted offer, no success commission is ever charged. We're financially incentivized to get you placed.",
  },
  {
    q: "How long does it typically take to get an offer?",
    a: "Most clients receive their first interview invitations within 2–3 weeks of onboarding. Placements typically happen within 4–8 weeks, depending on your target industry, seniority level, and how competitive your market is.",
  },
  {
    q: "What industries and roles do you cover?",
    a: "We work across tech, finance, operations, marketing, product, healthcare, and more. If it's a role that gets posted online, we can run your search. Our account managers specialize by industry so your outreach is always relevant.",
  },
  {
    q: "When exactly is the 5% success commission due?",
    a: "The 5% commission is due within 60 days of your signed offer letter. A one-time 30-day extension is available if you need it. If you don't accept an offer, no commission is charged — ever.",
  },
  {
    q: "Can I pause or stop if my plans change?",
    a: "Yes. You can pause your search at any time by contacting your account manager. We work around your timeline — whether you need a few weeks before you're ready for interviews or you're targeting a specific start date.",
  },
  {
    q: "How is this different from just applying on my own?",
    a: "Applying yourself means hours of searching, writing cover letters, tracking pipelines, and sending cold messages — with no guarantee of results and no feedback when you're ghosted. We give you a dedicated account manager and AI working 24/7, plus a referral network that surfaces opportunities before they're publicly posted.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {FAQS.map((faq, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <button
            className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span className="font-semibold text-gray-900 text-sm sm:text-base">{faq.q}</span>
            <svg
              className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
                openIndex === i ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openIndex === i && (
            <div className="px-6 pb-5">
              <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
