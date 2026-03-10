import Link from "next/link";
import ScrollReveal from "../ScrollReveal";

export default function FinalCtaSection() {
  return (
    <section className="py-20 sm:py-28 bg-gray-900 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-400 rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-400 rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/10 rounded-full text-sm font-medium text-gray-300 mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Taking new clients now
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to stop searching<br />and start getting hired?
          </h2>
          <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
            Your dedicated team is ready. AI working around the clock. Referral network
            access from day one. Interview prep that actually works.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
            <Link
              href="/signup"
              className="inline-block bg-orange-500 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:bg-orange-600 transition-all shadow-lg shadow-orange-900/30 hover:shadow-xl"
            >
              Get Started Today
            </Link>
            <a
              href="#referral-network"
              className="inline-block bg-white/10 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Learn About Referrals
            </a>
          </div>
          <p className="text-sm text-gray-500">
            No lock-in contracts. Success fee only on accepted offers.
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
