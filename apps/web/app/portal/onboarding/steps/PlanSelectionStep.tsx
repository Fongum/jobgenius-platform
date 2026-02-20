"use client";

interface PlanSelectionStepProps {
  selectedPlan: "essentials" | "premium" | null;
  onSelectPlan: (plan: "essentials" | "premium") => void;
  onContinue: () => void;
  onBack: () => void;
}

const PLAN_FEATURES = {
  essentials: [
    { label: "Job Applications", value: "Up to 20" },
    { label: "Referrals", value: "Up to 20" },
    { label: "Account Manager Support", value: "✓" },
    { label: "Resume Optimization", value: "✓" },
    { label: "Interview Preparation", value: "✗" },
    { label: "Referral Network Access", value: "✗" },
    { label: "Commission on Offer", value: "5% of year 1 salary" },
  ],
  premium: [
    { label: "Job Applications", value: "Unlimited" },
    { label: "Referrals", value: "Unlimited" },
    { label: "Account Manager Support", value: "✓" },
    { label: "Resume Optimization", value: "✓" },
    { label: "Interview Preparation", value: "✓" },
    { label: "Referral Network Access", value: "✓" },
    { label: "Commission on Offer", value: "5% of year 1 salary" },
  ],
};

export default function PlanSelectionStep({
  selectedPlan,
  onSelectPlan,
  onContinue,
  onBack,
}: PlanSelectionStepProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Choose Your Plan</h2>
        <p className="text-gray-500 mt-1 text-sm">
          Select the service tier that best fits your job search needs. A commission of 5% of your first year&apos;s base salary is due upon accepting a job offer.
        </p>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Essentials Card */}
        <button
          type="button"
          onClick={() => onSelectPlan("essentials")}
          className={`text-left rounded-xl border-2 p-5 transition-all ${
            selectedPlan === "essentials"
              ? "border-blue-600 bg-blue-50 shadow-md"
              : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-gray-900">Essentials</h3>
            {selectedPlan === "essentials" && (
              <span className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-medium">Selected</span>
            )}
          </div>
          <p className="text-3xl font-bold text-blue-600 mb-1">$500</p>
          <p className="text-xs text-gray-500 mb-4">one-time registration fee</p>
          <ul className="space-y-2">
            {PLAN_FEATURES.essentials.map((f) => (
              <li key={f.label} className="flex items-start justify-between text-sm gap-2">
                <span className="text-gray-600">{f.label}</span>
                <span className={`font-medium shrink-0 ${
                  f.value === "✗" ? "text-gray-400" : "text-gray-900"
                }`}>{f.value}</span>
              </li>
            ))}
          </ul>
        </button>

        {/* Premium Card */}
        <button
          type="button"
          onClick={() => onSelectPlan("premium")}
          className={`text-left rounded-xl border-2 p-5 transition-all relative ${
            selectedPlan === "premium"
              ? "border-purple-600 bg-purple-50 shadow-md"
              : "border-gray-200 hover:border-purple-300 hover:bg-gray-50"
          }`}
        >
          <div className="absolute -top-3 left-5">
            <span className="bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-gray-900">Premium</h3>
            {selectedPlan === "premium" && (
              <span className="text-xs bg-purple-600 text-white rounded-full px-2 py-0.5 font-medium">Selected</span>
            )}
          </div>
          <p className="text-3xl font-bold text-purple-600 mb-1">$1,000</p>
          <p className="text-xs text-gray-500 mb-4">one-time registration fee</p>
          <ul className="space-y-2">
            {PLAN_FEATURES.premium.map((f) => (
              <li key={f.label} className="flex items-start justify-between text-sm gap-2">
                <span className="text-gray-600">{f.label}</span>
                <span className={`font-medium shrink-0 ${
                  f.value === "✗" ? "text-gray-400" : f.value === "Unlimited" ? "text-purple-700" : "text-gray-900"
                }`}>{f.value}</span>
              </li>
            ))}
          </ul>
        </button>
      </div>

      {/* Commission note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
        <strong>Commission Note:</strong> Both plans include a 5% commission on your first year&apos;s base salary, due within 60 days of accepting a job offer. A 30-day extension is available on request.
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedPlan}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue with {selectedPlan === "premium" ? "Premium" : selectedPlan === "essentials" ? "Essentials" : "Selected Plan"}
        </button>
      </div>
    </div>
  );
}
