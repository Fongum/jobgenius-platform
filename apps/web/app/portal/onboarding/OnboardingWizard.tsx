"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WelcomeResumeStep from "./steps/WelcomeResumeStep";
import AboutYouStep from "./steps/AboutYouStep";
import JobPreferencesStep from "./steps/JobPreferencesStep";
import WorkStyleLocationStep from "./steps/WorkStyleLocationStep";
import SalaryAvailabilityStep from "./steps/SalaryAvailabilityStep";
import ReviewFinishStep from "./steps/ReviewFinishStep";

// ─── Types ─────────────────────────────────────────────────────

interface LocationPreference {
  work_type: "remote" | "hybrid" | "onsite";
  locations: string[];
}

export interface ProfileData {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  bio?: string;
  seniority?: string;
  work_type?: string;
  work_type_preferences?: string[];
  employment_type_preferences?: string[];
  salary_min?: number;
  salary_max?: number;
  target_titles?: string[];
  skills?: string[];
  years_experience?: number;
  preferred_industries?: string[];
  preferred_locations?: string[];
  location_preferences?: LocationPreference[];
  open_to_relocation?: boolean;
  requires_visa_sponsorship?: boolean;
  authorized_to_work?: boolean;
  citizenship_status?: string;
  start_date?: string;
  notice_period?: string;
  onboarding_completed_at?: string;
}

export interface DocRecord {
  id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

// ─── Step Definitions ──────────────────────────────────────────

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "about", label: "About You" },
  { id: "preferences", label: "Job Preferences" },
  { id: "workstyle", label: "Work Style" },
  { id: "salary", label: "Salary & Availability" },
  { id: "review", label: "Review" },
];

// ─── Progress Bar ──────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <>
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-center justify-between mb-8">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  i < currentStep
                    ? "bg-green-500 text-white"
                    : i === currentStep
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i < currentStep ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs mt-1 ${i === currentStep ? "text-blue-600 font-medium" : "text-gray-500"}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 lg:w-20 h-0.5 mx-1 ${i < currentStep ? "bg-green-500" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>
      {/* Mobile stepper */}
      <div className="sm:hidden mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <span className="text-sm text-gray-500">{STEPS[currentStep].label}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────

export default function OnboardingWizard({
  profile: initial,
  documents: initialDocs,
  userEmail,
}: {
  profile: ProfileData;
  documents: DocRecord[];
  userEmail: string;
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [docs, setDocs] = useState<DocRecord[]>(initialDocs);
  const [saving, setSaving] = useState(false);

  const update = useCallback((key: keyof ProfileData, value: unknown) => {
    setProfile((p) => ({ ...p, [key]: value }));
  }, []);

  const updateMany = useCallback((fields: Partial<ProfileData>) => {
    setProfile((p) => ({ ...p, ...fields }));
  }, []);

  const saveFields = useCallback(async (fields: Partial<ProfileData>): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) return false;
      const { profile: updated } = await res.json();
      setProfile(updated);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const goNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep((s) => s + 1);
  };

  const goBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  const handleSkip = () => {
    document.cookie = "jg_onboarding_skipped=1; path=/; max-age=86400; SameSite=Lax";
    router.push("/portal");
  };

  const handleFinish = async () => {
    const ok = await saveFields({ onboarding_completed_at: new Date().toISOString() });
    if (ok) {
      router.push("/portal");
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Set Up Your Profile</h1>
        <button
          onClick={handleSkip}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Skip for now
        </button>
      </div>

      <ProgressBar currentStep={currentStep} />

      {/* Step content */}
      {currentStep === 0 && (
        <WelcomeResumeStep
          profile={profile}
          docs={docs}
          setDocs={setDocs}
          updateMany={updateMany}
          onContinue={goNext}
          userName={profile.full_name || userEmail}
        />
      )}
      {currentStep === 1 && (
        <AboutYouStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}
      {currentStep === 2 && (
        <JobPreferencesStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}
      {currentStep === 3 && (
        <WorkStyleLocationStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}
      {currentStep === 4 && (
        <SalaryAvailabilityStep
          profile={profile}
          update={update}
          saving={saving}
          saveFields={saveFields}
          onContinue={goNext}
          onBack={goBack}
        />
      )}
      {currentStep === 5 && (
        <ReviewFinishStep
          profile={profile}
          saving={saving}
          goToStep={goToStep}
          onFinish={handleFinish}
          onBack={goBack}
        />
      )}
    </div>
  );
}
