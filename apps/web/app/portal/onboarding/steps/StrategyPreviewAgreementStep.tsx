"use client";

import { useState } from "react";

type PlanType = "essentials" | "premium";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function StrategyPreviewAgreementStep({
  planType,
  baseRegistrationFee,
  initialAgreed,
  onContinue,
  onBack,
}: {
  planType: PlanType;
  baseRegistrationFee: number;
  initialAgreed?: boolean;
  onContinue: (agreedAt: string) => void;
  onBack: () => void;
}) {
  const [agreed, setAgreed] = useState(Boolean(initialAgreed));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">
          7-Day Strategy Preview
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Review the strategy before you commit to execution
        </h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          Your preview includes a resume audit, a target-role plan, and an optional
          kickoff call. Live applications, recruiter outreach, and ongoing account
          manager execution begin only after the intake is complete and the plan is
          finalized.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-900">Included</h3>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/85">
            <li>Resume audit with clear improvement notes</li>
            <li>Target-role and positioning plan</li>
            <li>Optional kickoff call with your account manager</li>
          </ul>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Not Included Yet</h3>
          <ul className="mt-3 space-y-2 text-sm text-amber-900/85">
            <li>No live job applications</li>
            <li>No recruiter or referral outreach</li>
            <li>No active search execution until payment is confirmed</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-900">
          Selected plan after preview:{" "}
          <span className="capitalize">{planType}</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">
          If you convert after the preview window, your registration charge will be{" "}
          <strong>{formatCurrency(baseRegistrationFee)}</strong> at the standard plan
          price.
        </p>
      </div>

      <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-gray-700">
          I understand that this is a short planning engagement only, not a full
          free trial of managed search. I agree that live execution starts only after
          paid conversion.
        </span>
      </label>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onContinue(new Date().toISOString())}
          disabled={!agreed}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue with Strategy Preview
        </button>
      </div>
    </div>
  );
}
