import Link from "next/link";
import ScrollReveal from "../ScrollReveal";

function PricingItem({
  included,
  text,
  light,
}: {
  included: boolean;
  text: string;
  light?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      {included ? (
        <svg
          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${light ? "text-orange-300" : "text-violet-600"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={light ? "text-violet-100" : included ? "text-gray-700" : "text-gray-400"}>
        {text}
      </span>
    </li>
  );
}

export default function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-28">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Simple pricing. Real execution.
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            Choose your plan and how to pay. Both plans support 1 to 3 installments
            completed within 1 month.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Tier 1 — Essentials */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-8 flex flex-col hover:border-violet-200 hover:shadow-lg transition-all">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">Essentials</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Unlimited applications + guided outreach
                </p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-gray-900">$500</span>
                <span className="text-gray-500 ml-1">registration fee</span>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mb-6">
                <p className="text-sm font-medium text-orange-700">
                  Pay in 1 to 3 installments within 1 month
                </p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <PricingItem included text="Unlimited job applications" />
                <PricingItem included text="Up to 20 referral outreaches" />
                <PricingItem included text="Dedicated account manager support" />
                <PricingItem included text="Resume optimization guidance" />
                <PricingItem included text="Portal with real-time updates" />
                <PricingItem included={false} text="Priority referral network access" />
                <PricingItem included={false} text="Interview coaching + AI voice practice" />
              </ul>
              <Link
                href="/signup"
                className="block text-center bg-white text-violet-700 px-6 py-3 rounded-xl font-semibold border-2 border-violet-600 hover:bg-violet-50 transition-colors"
              >
                Choose Essentials
              </Link>
            </div>

            {/* Tier 2 — Premium */}
            <div className="bg-gradient-to-b from-violet-600 to-violet-700 rounded-2xl p-8 text-white flex flex-col relative overflow-hidden shadow-xl shadow-violet-200">
              <div className="absolute top-4 right-4 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold">Premium</h3>
                <p className="text-sm text-violet-200 mt-1">
                  Unlimited applications + priority support
                </p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold">$1,000</span>
                <span className="text-violet-200 ml-1">registration fee</span>
              </div>
              <div className="bg-white/15 border border-white/20 rounded-lg px-4 py-2.5 mb-6">
                <p className="text-sm font-medium text-orange-300">
                  Pay in 1 to 3 installments within 1 month
                </p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <PricingItem included light text="Unlimited job applications" />
                <PricingItem included light text="Unlimited referral outreaches" />
                <PricingItem included light text="Dedicated account manager support" />
                <PricingItem included light text="Resume optimization + interview coaching" />
                <PricingItem included light text="Priority referral network access" />
                <PricingItem included light text="AI interview prep + voice practice" />
                <PricingItem included light text="Portal with real-time updates" />
              </ul>
              <Link
                href="/signup"
                className="block text-center bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors shadow-lg"
              >
                Choose Premium
              </Link>
            </div>
          </div>

          <div className="mt-8 space-y-2 text-center text-sm text-gray-500">
            <p>
              Success commission for both plans:{" "}
              <strong className="text-gray-900">5% of first-year base salary after placement.</strong>
            </p>
            <p>
              Commission is due within 60 days of accepted offer. One-time 30-day extension available.
            </p>
            <p className="text-gray-400">No hidden fees. No accepted offer, no success commission.</p>
          </div>

          {/* ROI callout */}
          <div className="mt-8 bg-violet-50 border border-violet-100 rounded-xl px-6 py-5 text-center max-w-2xl mx-auto">
            <p className="text-sm text-violet-800">
              <strong>Quick math:</strong> On an $80k salary, the 5% success fee is $4,000 &mdash; paid once,
              only after you&apos;re hired. Compare that to months of unpaid job-search hours and missed
              opportunities from going it alone.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
