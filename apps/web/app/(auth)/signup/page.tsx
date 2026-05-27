"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CapacityNotice, { type CapacityNoticeSummary } from "@/app/components/CapacityNotice";

type UserType = "am" | "job_seeker";

type ParsedResume = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  bio?: string;
  skills?: string[];
  work_history?: unknown[];
  education?: unknown[];
};

type PublicCapacityResponse = CapacityNoticeSummary & {
  capacityMonth: string;
};

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userType, setUserType] = useState<UserType>("job_seeker");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [parsedRawText, setParsedRawText] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState("");
  const [capacitySummary, setCapacitySummary] = useState<PublicCapacityResponse | null>(null);

  useEffect(() => {
    const incomingCode = searchParams.get("code") ?? searchParams.get("ref");
    if (incomingCode) setOfferCode(incomingCode.trim().toUpperCase());
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadCapacity() {
      try {
        const response = await fetch("/api/public/capacity", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as PublicCapacityResponse;
        if (!cancelled) {
          setCapacitySummary(data);
        }
      } catch {
        // Ignore capacity fetch failures on signup.
      }
    }

    loadCapacity();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResumeUpload = async (file: File) => {
    setResumeError("");
    setResumeParsing(true);
    setResumeFileName(file.name);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/auth/parse-resume", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setResumeError(data.error || "Could not read that file. You can fill in the form manually.");
        setResumeFileName(null);
        return;
      }

      const parsed: ParsedResume = data.parsed || {};
      setParsedResume(parsed);
      setParsedRawText(typeof data.raw_text === "string" ? data.raw_text : null);

      if (parsed.full_name && !name) setName(parsed.full_name);
      if (parsed.email && !email) setEmail(parsed.email);
    } catch {
      setResumeError("Upload failed. Try again or fill in the form manually.");
      setResumeFileName(null);
    } finally {
      setResumeParsing(false);
    }
  };

  const handleResumeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleResumeUpload(file);
  };

  const handleResumeDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleResumeUpload(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const resumePayload =
        userType === "job_seeker" && parsedResume
          ? {
              resume: {
                phone: parsedResume.phone,
                linkedin_url: parsedResume.linkedin_url,
                location: parsedResume.location,
                bio: parsedResume.bio,
                skills: parsedResume.skills,
                work_history: parsedResume.work_history,
                education: parsedResume.education,
                raw_text: parsedRawText ?? undefined,
              },
            }
          : {};

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          userType,
          ...(offerCode ? { offerCode } : {}),
          ...resumePayload,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Signup failed.");
        setLoading(false);
        return;
      }

      if (data.user.userType === "job_seeker") {
        router.push(
          `/portal/onboarding${offerCode ? `?code=${encodeURIComponent(offerCode)}` : ""}`
        );
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const onboardingSteps =
    userType === "am"
      ? [
          "Review seekers, target roles, and queue state from one workspace.",
          "Coordinate outreach, interview prep, and client updates without losing context.",
          "Use the portal as the operating system for every active search.",
        ]
      : [
          "We parse your resume, capture your targets, and start shaping a search plan.",
          "Your account manager handles applications, recruiter outreach, and pipeline follow-up.",
          "When interviews land, you get prep support instead of scrambling alone.",
        ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.10),_transparent_35%),linear-gradient(to_bottom,_#faf5ff,_#ffffff_30%,_#fff7ed)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="pt-4 lg:pt-10">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-violet-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-violet-700 shadow-sm backdrop-blur hover:border-violet-300 hover:text-violet-800"
          >
            JobGenius
          </Link>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
            {userType === "am" ? "Account manager workspace" : "Managed job search"}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {userType === "am"
              ? "Create the workspace you will use to run client searches."
              : "Set up your search once. We handle the execution after that."}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-gray-600">
            {userType === "am"
              ? "Use this account to review seekers, manage applications, coordinate outreach, and keep every pipeline visible."
              : "Upload a resume, define your targets, and hand the repetitive work to a dedicated account manager backed by always-on AI."}
          </p>

          {offerCode && (
            <p className="mt-4 inline-flex items-center rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
              Offer code ready: {offerCode}
            </p>
          )}

          <div className="mt-8 rounded-3xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-violet-100/60 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {userType === "am" ? "What this unlocks" : "What happens next"}
            </p>
            <div className="mt-5 space-y-4">
              {onboardingSteps.map((item, index) => (
                <div key={item} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white shadow-lg shadow-violet-200">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm leading-relaxed text-gray-700">{item}</p>
                </div>
              ))}
            </div>

            {userType === "job_seeker" && (
              <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 text-sm text-orange-900">
                Registration starts at <strong>$500</strong>. With a valid code,
                Essentials becomes <strong>$400</strong> and Premium becomes{" "}
                <strong>$750</strong>. The <strong>5% success fee</strong> is only due
                after you accept an offer.
              </div>
            )}

            {userType === "job_seeker" && capacitySummary && (
              <CapacityNotice
                summary={capacitySummary}
                variant="outline"
                compact
                className="mt-4"
              />
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-violet-100/70 sm:p-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              {userType === "am" ? "Workspace access" : "Usually about 5 minutes"}
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">
              Create your account
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {userType === "am"
                ? "Sign up as an account manager to start managing job seekers."
                : "Create your account, then continue into onboarding to confirm targets and resume details."}
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                {error}
              </div>
            )}

            <div>
              <a
                href={`/api/auth/oauth/google/start?userType=${userType}${offerCode ? `&offerCode=${encodeURIComponent(offerCode)}` : ""}`}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                </svg>
                Continue with Google
              </a>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs uppercase tracking-wider text-gray-500">or use email</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                I am a
              </label>
              <p className="sr-only" id="user-type-help">
                Choose the type of account you want to create.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUserType("am")}
                  className={`flex flex-col items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                    userType === "am"
                      ? "border-violet-600 bg-violet-50 text-violet-700"
                      : "border-gray-400 bg-white text-gray-800 hover:border-gray-500"
                  }`}
                >
                  <svg className="mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  Account Manager
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("job_seeker")}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                    userType === "job_seeker"
                      ? "border-violet-600 bg-violet-50 text-violet-700"
                      : "border-gray-400 bg-white text-gray-800 hover:border-gray-500"
                  }`}
                >
                  <span className="absolute -top-2.5 right-2 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    Most users
                  </span>
                  <svg className="mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  Job Seeker
                </button>
              </div>
            </div>

            {userType === "job_seeker" && (
              <div className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      Skip the typing and upload your resume
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      We&apos;ll fill in your name, email, work history and skills automatically.
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    ~30 sec
                  </span>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleResumeDrop}
                  className="mt-3 rounded-md border border-violet-200 bg-white p-3"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
                    onChange={handleResumeInputChange}
                    className="hidden"
                  />

                  {!resumeFileName && !resumeParsing && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-violet-700 hover:text-violet-900"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9 5 5 0 019.9-1A5.5 5.5 0 0118.5 16H7zM12 12v6m0 0l-2-2m2 2l2-2" />
                      </svg>
                      Choose file or drag &amp; drop - PDF, DOCX
                    </button>
                  )}

                  {resumeParsing && (
                    <div className="flex items-center gap-2 py-2 text-sm text-gray-700">
                      <svg className="h-4 w-4 animate-spin text-violet-600" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.3" />
                        <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" fill="none" />
                      </svg>
                      Reading {resumeFileName}&hellip;
                    </div>
                  )}

                  {!resumeParsing && resumeFileName && parsedResume && (
                    <div className="py-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2 text-sm text-green-700">
                          <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="truncate font-medium">{resumeFileName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setResumeFileName(null);
                            setParsedResume(null);
                            setParsedRawText(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        Pulled in:&nbsp;
                        {[
                          parsedResume.full_name && "name",
                          parsedResume.email && "email",
                          parsedResume.phone && "phone",
                          parsedResume.linkedin_url && "LinkedIn",
                          parsedResume.skills?.length ? `${parsedResume.skills.length} skills` : null,
                          parsedResume.work_history?.length ? `${parsedResume.work_history.length} roles` : null,
                          parsedResume.education?.length ? "education" : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "raw text only"}
                      </p>
                    </div>
                  )}

                  {resumeError && <p className="mt-2 text-xs text-red-600">{resumeError}</p>}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-gray-800">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-800">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-800">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                  placeholder="********"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Must be at least 8 characters
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-800">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                  placeholder="********"
                />
              </div>

              {userType === "job_seeker" && (
                <div>
                  <label htmlFor="offerCode" className="block text-sm font-semibold text-gray-800">
                    Referral or promo code
                  </label>
                  <input
                    id="offerCode"
                    name="offerCode"
                    type="text"
                    value={offerCode}
                    onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                    className="mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder-gray-500 focus:border-violet-500 focus:outline-none focus:ring-violet-500"
                    placeholder="Optional"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Use a valid referral or promo code to unlock discounted direct-signup pricing in onboarding.
                  </p>
                </div>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md border border-transparent bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Creating account..."
                  : userType === "am"
                    ? "Create account"
                    : "Create account and start onboarding"}
              </button>
              {userType === "job_seeker" && (
                <p className="mt-3 text-center text-xs text-gray-500">
                  After signup, you will choose either direct discounted signup or a 7-day strategy preview before submitting for review.
                </p>
              )}
            </div>

            <div className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-violet-700 hover:text-violet-600">
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
