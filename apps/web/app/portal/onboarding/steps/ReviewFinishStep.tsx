"use client";

import type { ProfileData } from "../OnboardingWizard";

// ─── Profile Score ─────────────────────────────────────────────

function calculateScore(profile: ProfileData): number {
  let score = 0;
  let total = 0;

  const check = (val: unknown, weight = 1) => {
    total += weight;
    if (val !== undefined && val !== null && val !== "") {
      if (Array.isArray(val)) {
        if (val.length > 0) score += weight;
      } else {
        score += weight;
      }
    }
  };

  check(profile.full_name, 2);
  check(profile.phone);
  check(profile.location, 2);
  check(profile.linkedin_url);
  check(profile.bio);
  check(profile.seniority);
  check(profile.target_titles, 2);
  check(profile.skills, 2);
  check(profile.preferred_industries);
  check(profile.employment_type_preferences);
  check(profile.location_preferences, 3);
  check(profile.salary_min);
  check(profile.salary_max);
  check(profile.start_date);
  check(profile.notice_period);
  check(profile.authorized_to_work);
  check(profile.citizenship_status);

  return total > 0 ? Math.round((score / total) * 100) : 0;
}

function ProfileScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;
  const filled = (score / 100) * circumference;

  let color = "text-red-500";
  if (score >= 80) color = "text-green-500";
  else if (score >= 50) color = "text-amber-500";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-900">
          {score}%
        </span>
      </div>
      <span className="text-sm font-medium text-gray-600 mt-2">Profile Completion</span>
    </div>
  );
}

// ─── Summary Section ───────────────────────────────────────────

function SummaryCard({
  title,
  stepIndex,
  items,
  goToStep,
}: {
  title: string;
  stepIndex: number;
  items: { label: string; value: string | undefined | null; missing?: boolean }[];
  goToStep: (step: number) => void;
}) {
  const hasMissing = items.some((i) => i.missing);

  return (
    <div className={`border rounded-lg p-4 ${hasMissing ? "border-amber-200 bg-amber-50/50" : "border-gray-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <button
          onClick={() => goToStep(stepIndex)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Edit
        </button>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            {item.missing ? (
              <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-700 text-xs font-bold">!</span>
              </span>
            ) : (
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-xs text-gray-600">{item.label}:</span>
            <span className={`text-xs ${item.missing ? "text-amber-600 italic" : "text-gray-900"}`}>
              {item.missing ? "Not set" : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export default function ReviewFinishStep({
  profile,
  saving,
  goToStep,
  onFinish,
  onBack,
}: {
  profile: ProfileData;
  saving: boolean;
  goToStep: (step: number) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const score = calculateScore(profile);

  const isEmpty = (val: unknown) => {
    if (val === undefined || val === null || val === "") return true;
    if (Array.isArray(val)) return val.length === 0;
    return false;
  };

  const formatArray = (arr?: string[]) => {
    if (!arr || arr.length === 0) return undefined;
    if (arr.length <= 3) return arr.join(", ");
    return `${arr.slice(0, 3).join(", ")} +${arr.length - 3} more`;
  };

  const formatLocPrefs = () => {
    const prefs = profile.location_preferences;
    if (!prefs || prefs.length === 0) return undefined;
    return prefs.map((p) => {
      const label = p.work_type === "onsite" ? "On-site" : p.work_type.charAt(0).toUpperCase() + p.work_type.slice(1);
      const locs = p.locations.length > 2 ? `${p.locations.slice(0, 2).join(", ")} +${p.locations.length - 2}` : p.locations.join(", ");
      return `${label}: ${locs}`;
    }).join(" | ");
  };

  const formatSalary = () => {
    if (profile.salary_min && profile.salary_max) return `$${profile.salary_min.toLocaleString()} - $${profile.salary_max.toLocaleString()}`;
    if (profile.salary_min) return `$${profile.salary_min.toLocaleString()}+`;
    if (profile.salary_max) return `Up to $${profile.salary_max.toLocaleString()}`;
    return undefined;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Review Your Profile</h2>
      <p className="text-sm text-gray-500 mb-6">Review your information below. You can edit anything by clicking &quot;Edit&quot; on each section.</p>

      <div className="flex justify-center mb-8">
        <ProfileScoreRing score={score} />
      </div>

      {score < 60 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-amber-800">
            Your profile is only {score}% complete. Consider filling in more details for better job matches.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          title="About You"
          stepIndex={1}
          goToStep={goToStep}
          items={[
            { label: "Name", value: profile.full_name, missing: isEmpty(profile.full_name) },
            { label: "Phone", value: profile.phone, missing: isEmpty(profile.phone) },
            { label: "Location", value: profile.location, missing: isEmpty(profile.location) },
            { label: "LinkedIn", value: profile.linkedin_url ? "Connected" : undefined, missing: isEmpty(profile.linkedin_url) },
          ]}
        />
        <SummaryCard
          title="Job Preferences"
          stepIndex={2}
          goToStep={goToStep}
          items={[
            { label: "Seniority", value: profile.seniority, missing: isEmpty(profile.seniority) },
            { label: "Titles", value: formatArray(profile.target_titles), missing: isEmpty(profile.target_titles) },
            { label: "Skills", value: formatArray(profile.skills), missing: isEmpty(profile.skills) },
            { label: "Industries", value: formatArray(profile.preferred_industries), missing: isEmpty(profile.preferred_industries) },
          ]}
        />
        <SummaryCard
          title="Work Style & Location"
          stepIndex={3}
          goToStep={goToStep}
          items={[
            { label: "Work Preferences", value: formatLocPrefs(), missing: isEmpty(profile.location_preferences) },
            { label: "Relocation", value: profile.open_to_relocation === true ? "Yes" : profile.open_to_relocation === false ? "No" : undefined, missing: profile.open_to_relocation === undefined },
          ]}
        />
        <SummaryCard
          title="Salary & Availability"
          stepIndex={4}
          goToStep={goToStep}
          items={[
            { label: "Salary Range", value: formatSalary(), missing: isEmpty(profile.salary_min) && isEmpty(profile.salary_max) },
            { label: "Start Date", value: profile.start_date, missing: isEmpty(profile.start_date) },
            { label: "Work Authorization", value: profile.authorized_to_work === true ? "Authorized" : profile.authorized_to_work === false ? "Not authorized" : undefined, missing: profile.authorized_to_work === undefined },
          ]}
        />
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
          Back
        </button>
        <button
          onClick={onFinish}
          disabled={saving}
          className="px-8 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? "Finishing..." : "Finish & Go to Dashboard"}
        </button>
      </div>
    </div>
  );
}
