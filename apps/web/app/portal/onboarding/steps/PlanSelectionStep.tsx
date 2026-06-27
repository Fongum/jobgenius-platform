"use client";

type PlanType = "essentials" | "premium";
type OfferPath = "discount" | "strategy_preview";

interface OfferQuote {
  planType: PlanType;
  code: string | null;
  source: "promo_code" | "seeker_referral" | null;
  applied: boolean;
  invalidCode: boolean;
  baseFee: number;
  discountPercent: number;
  discountAmount: number;
  finalFee: number;
  message?: string;
}

interface PlanSelectionStepProps {
  selectedPlan: PlanType | null;
  onSelectPlan: (plan: PlanType) => void;
  offerPath: OfferPath;
  onOfferPathChange: (path: OfferPath) => void;
  offerCode: string;
  onOfferCodeChange: (value: string) => void;
  onApplyOfferCode: () => void;
  offerQuote: OfferQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  onContinue: () => void;
  onBack: () => void;
}

const PLAN_FEATURES: Record<PlanType, { label: string; value: string }[]> = {
  essentials: [
    { label: "Job Applications", value: "Unlimited" },
    { label: "Referrals", value: "Up to 20" },
    { label: "Account Manager Support", value: "Included" },
    { label: "Resume Optimization", value: "Included" },
    { label: "Interview Preparation", value: "Not included" },
    { label: "Referral Network Access", value: "Not included" },
    { label: "Commission on Offer", value: "5% of year 1 salary" },
  ],
  premium: [
    { label: "Job Applications", value: "Unlimited" },
    { label: "Referrals", value: "Unlimited" },
    { label: "Account Manager Support", value: "Included" },
    { label: "Resume Optimization", value: "Included" },
    { label: "Interview Preparation", value: "Included" },
    { label: "Referral Network Access", value: "Included" },
    { label: "Commission on Offer", value: "5% of year 1 salary" },
  ],
};

const PLAN_PRICING: Record<
  PlanType,
  { baseFee: number; discountedFee: number; badgeClass: string }
> = {
  essentials: {
    baseFee: 500,
    discountedFee: 400,
    badgeClass: "bg-violet-600 text-white",
  },
  premium: {
    baseFee: 1000,
    discountedFee: 750,
    badgeClass: "bg-violet-600 text-white",
  },
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function PlanSelectionStep({
  selectedPlan,
  onSelectPlan,
  offerPath,
  onOfferPathChange,
  offerCode,
  onOfferCodeChange,
  onApplyOfferCode,
  offerQuote,
  quoteLoading,
  quoteError,
  onContinue,
  onBack,
}: PlanSelectionStepProps) {
  const selectedQuote =
    selectedPlan && offerQuote?.planType === selectedPlan ? offerQuote : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Choose Your Plan</h2>
        <p className="text-gray-500 mt-1 text-sm">
          Pick your service tier here. We collect the rest of the details first,
          then finalize either the preview path or the registration terms after
          the intake is complete.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {(["essentials", "premium"] as PlanType[]).map((plan) => {
          const pricing = PLAN_PRICING[plan];
          const isSelected = selectedPlan === plan;
          const borderClass =
            plan === "premium"
              ? isSelected
                ? "border-violet-600 bg-violet-50 shadow-md"
                : "border-gray-200 hover:border-violet-300 hover:bg-gray-50"
              : isSelected
              ? "border-violet-600 bg-violet-50 shadow-md"
              : "border-gray-200 hover:border-violet-300 hover:bg-gray-50";
          const titleClass = plan === "premium" ? "text-violet-600" : "text-violet-600";

          return (
            <button
              key={plan}
              type="button"
              onClick={() => onSelectPlan(plan)}
              className={`text-left rounded-xl border-2 p-5 transition-all relative ${borderClass}`}
            >
              {plan === "premium" && (
                <div className="absolute -top-3 left-5">
                  <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-gray-900 capitalize">{plan}</h3>
                {isSelected && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${pricing.badgeClass}`}>
                    Selected
                  </span>
                )}
              </div>
              <div className="mb-4">
                <p className={`text-3xl font-bold ${titleClass}`}>
                  {formatCurrency(pricing.baseFee)}
                </p>
                <p className="text-xs text-gray-500">registration charge</p>
                <p className="mt-2 text-sm font-medium text-emerald-700">
                  With a valid code: {formatCurrency(pricing.discountedFee)}
                </p>
              </div>
              <ul className="space-y-2">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li
                    key={feature.label}
                    className="flex items-start justify-between text-sm gap-2"
                  >
                    <span className="text-gray-600">{feature.label}</span>
                    <span className="font-medium shrink-0 text-gray-900">
                      {feature.value}
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mb-6">
        <p className="text-sm font-semibold text-gray-900 mb-3">Choose your path</p>
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onOfferPathChange("discount")}
            className={`rounded-xl border-2 p-5 text-left transition-all ${
              offerPath === "discount"
                ? "border-emerald-500 bg-emerald-50 shadow-sm"
                : "border-gray-200 hover:border-emerald-300 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-gray-900">
                  Direct signup with discount
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  20% off Essentials and 25% off Premium with a valid promo or
                  referral code.
                </p>
              </div>
              {offerPath === "discount" && (
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  Selected
                </span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOfferPathChange("strategy_preview")}
            className={`rounded-xl border-2 p-5 text-left transition-all ${
              offerPath === "strategy_preview"
                ? "border-violet-500 bg-violet-50 shadow-sm"
                : "border-gray-200 hover:border-violet-300 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-gray-900">
                  7-day strategy preview
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Resume audit, target-role plan, and optional kickoff call
                  before committing to paid execution.
                </p>
              </div>
              {offerPath === "strategy_preview" && (
                <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
                  Selected
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {offerPath === "discount" ? (
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-900">
              Direct signup pricing
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Essentials is 20% off with a valid code. Premium is 25% off with a
              valid code. Without a code, standard pricing stays in place.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="offer-code"
                className="block text-sm font-semibold text-gray-800 mb-1"
              >
                Referral or promo code
              </label>
              <input
                id="offer-code"
                type="text"
                value={offerCode}
                onChange={(event) => onOfferCodeChange(event.target.value.toUpperCase())}
                placeholder="Enter your code"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <button
              type="button"
              onClick={onApplyOfferCode}
              disabled={!selectedPlan || quoteLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {quoteLoading ? "Applying..." : "Apply Code"}
            </button>
          </div>

          {!selectedPlan && (
            <p className="mt-2 text-xs text-gray-500">
              Select a plan first so we can price the code correctly.
            </p>
          )}

          {selectedQuote && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                selectedQuote.applied
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : selectedQuote.invalidCode
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              <p className="font-semibold">
                {selectedQuote.applied
                  ? `${selectedQuote.message ?? "Discount applied."} Your registration fee is ${formatCurrency(
                      selectedQuote.finalFee
                    )}.`
                  : selectedQuote.invalidCode
                  ? selectedQuote.message ?? "That code could not be applied."
                  : `Current registration fee: ${formatCurrency(selectedQuote.finalFee)}.`}
              </p>
              {(selectedQuote.applied || selectedQuote.discountAmount > 0) && (
                <p className="mt-1 text-xs">
                  Base fee {formatCurrency(selectedQuote.baseFee)} minus{" "}
                  {formatCurrency(selectedQuote.discountAmount)} (
                  {Math.round(selectedQuote.discountPercent * 100)}%) for{" "}
                  {formatCurrency(selectedQuote.finalFee)} due.
                </p>
              )}
            </div>
          )}

          {quoteError && <p className="mt-2 text-xs text-red-600">{quoteError}</p>}
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-900">
            Strategy preview path
          </p>
          <p className="mt-1 text-sm text-violet-900/80">
            You will start with a resume audit, a target-role plan, and an optional
            kickoff call. If you convert after the preview, you pay the full
            standard registration fee for the plan you selected.
          </p>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
        <strong>Commission note:</strong> Both plans include a 5% commission on your
        first year&apos;s base salary, due within 90 days of accepting a job offer. A
        30-day extension is available on request.
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
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {offerPath === "strategy_preview"
            ? "Continue to Preview Terms"
            : "Continue to Agreement"}
        </button>
      </div>
    </div>
  );
}
