import ScrollReveal from "../ScrollReveal";
import { INTERVIEW_GUARANTEE_SUMMARY, NO_GUARANTEE_POINTS } from "./marketingContent";

export default function GuaranteesSection() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50">
      <ScrollReveal>
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
            <div className="mb-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                What We Do Guarantee
              </p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Interview guarantee</h2>
              <p className="mt-3 text-sm leading-6 text-gray-700 sm:text-base">
                {INTERVIEW_GUARANTEE_SUMMARY}
              </p>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">
              Service Boundaries
            </p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
              What We Do Not Guarantee
            </h2>
            <ul className="mt-8 space-y-4">
              {NO_GUARANTEE_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm leading-6 text-gray-700 sm:text-base">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
