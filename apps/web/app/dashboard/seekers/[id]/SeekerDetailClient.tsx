"use client";

import { useState } from "react";
import Link from "next/link";

interface ScoringWeights {
  skills: number;
  title: number;
  experience: number;
  salary: number;
  location: number;
  company_fit: number;
  max_penalty: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  skills: 35,
  title: 20,
  experience: 10,
  salary: 10,
  location: 15,
  company_fit: 10,
  max_penalty: 15,
};

interface WorkHistoryEntry {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  degree: string;
  school: string;
  field: string;
  graduation_year: string;
}

interface LocationPreference {
  work_type: string;
  locations: string[];
}

interface SeekerData {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  seniority: string | null;
  work_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  target_titles: string[] | null;
  skills: string[] | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  profile_completion: number | null;
  match_threshold: number | null;
  match_weights: ScoringWeights | null;
  education: EducationEntry[] | null;
  work_history: WorkHistoryEntry[] | null;
  bio: string | null;
  years_experience: number | null;
  preferred_industries: string[] | null;
  preferred_company_sizes: string[] | null;
  location_preferences: LocationPreference[] | null;
  work_type_preferences: string[] | null;
  employment_type_preferences: string[] | null;
  open_to_relocation: boolean | null;
  // Address
  address_line1: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  // Work authorization
  authorized_to_work: boolean | null;
  requires_visa_sponsorship: boolean | null;
  visa_status: string | null;
  citizenship_status: string | null;
  requires_h1b_transfer: boolean | null;
  needs_employer_sponsorship: boolean | null;
  // Availability
  start_date: string | null;
  notice_period: string | null;
  available_for_relocation: boolean | null;
  available_for_travel: boolean | null;
  willing_to_work_overtime: boolean | null;
  willing_to_work_weekends: boolean | null;
  preferred_shift: string | null;
  open_to_contract: boolean | null;
}

interface MatchedJob {
  id: string;
  score: number;
  reasons: unknown;
  job: { id: string; title: string; company: string; location: string; url: string } | null;
  routingDecision: string | null;
  routingNote: string | null;
}

interface QueueItem {
  id: string;
  status: string;
  category: string;
  created_at: string;
  job_posts: { id: string; title: string; company: string; location: string; url: string } | null;
}

interface RunItem {
  id: string;
  status: string;
  current_step: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  job_posts: { id: string; title: string; company: string; location: string; url: string } | null;
}

interface OutreachDraft {
  id: string;
  subject: string | null;
  body: string | null;
  status: string;
  sent_at: string | null;
  job_posts: { id: string; title: string; company: string } | null;
  outreach_contacts: { id: string; full_name: string | null; email: string | null; title: string | null } | null;
}

interface RecruiterThread {
  id: string;
  thread_status: string;
  last_reply_at: string | null;
  next_follow_up_at: string | null;
  recruiters: { id: string; name: string | null; title: string | null; company: string | null; email: string | null } | null;
}

interface Interview {
  id: string;
  scheduled_at: string;
  duration_min: number;
  interview_type: string;
  meeting_link: string | null;
  status: string;
  notes_for_candidate: string | null;
  notes_internal: string | null;
  job_posts: { id: string; title: string; company: string } | null;
}

interface InterviewPrep {
  id: string;
  content: unknown;
  created_at: string;
  job_posts: { id: string; title: string; company: string } | null;
}

interface Reference {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  relationship: string;
}

interface Document {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

interface InboundEmail {
  id: string;
  from_email: string;
  from_name: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  classification: string;
  classification_confidence: number;
  matched_application_id: string | null;
}

interface GmailConnectionInfo {
  email: string;
  connectedAt: string;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "jobs", label: "Jobs" },
  { id: "applications", label: "Applications" },
  { id: "outreach", label: "Outreach" },
  { id: "interviews", label: "Interviews" },
  { id: "prep", label: "Prep" },
  { id: "inbox", label: "Inbox" },
];

export default function SeekerDetailClient({
  seeker,
  matchedJobs,
  queueItems,
  runs,
  outreachDrafts,
  recruiterThreads,
  interviews,
  interviewPrep,
  references,
  documents,
  gmailConnection,
  inboundEmails,
}: {
  seeker: SeekerData;
  matchedJobs: MatchedJob[];
  queueItems: QueueItem[];
  runs: RunItem[];
  outreachDrafts: OutreachDraft[];
  recruiterThreads: RecruiterThread[];
  interviews: Interview[];
  interviewPrep: InterviewPrep[];
  references: Reference[];
  documents: Document[];
  gmailConnection: GmailConnectionInfo | null;
  inboundEmails: InboundEmail[];
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const threshold = seeker.match_threshold ?? 60;
  const aboveThreshold = matchedJobs.filter((m) => m.score >= threshold && m.routingDecision !== "OVERRIDDEN_OUT");
  const needsAttention = runs.filter((r) => r.status === "NEEDS_ATTENTION").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <Link
              href="/dashboard/seekers"
              className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
            >
              ← Back to Job Seekers
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {seeker.full_name || "Unnamed Seeker"}
            </h1>
            <p className="text-gray-600">{seeker.email}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {seeker.location && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                  {seeker.location}
                </span>
              )}
              {seeker.seniority && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded capitalize">
                  {seeker.seniority}
                </span>
              )}
              {seeker.work_type && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded capitalize">
                  {seeker.work_type}
                </span>
              )}
              {gmailConnection ? (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Gmail: {gmailConnection.email}
                </span>
              ) : (
                <span className="px-2 py-1 bg-red-50 text-red-400 text-sm rounded">
                  Gmail not connected
                </span>
              )}
              {seeker.salary_min && seeker.salary_max && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm rounded">
                  ${seeker.salary_min.toLocaleString()} - ${seeker.salary_max.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-center">
            <StatBox label="Matched Jobs" value={aboveThreshold.length} />
            <StatBox label="In Queue" value={queueItems.filter((q) => q.status === "QUEUED").length} color="blue" />
            <StatBox label="Applied" value={runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status)).length} color="green" />
            {needsAttention > 0 && (
              <StatBox label="Needs Attention" value={needsAttention} color="orange" />
            )}
            <StatBox label="Interviews" value={interviews.filter((i) => i.status === "confirmed").length} color="purple" />
            <StatBox label="Inbox" value={inboundEmails.length} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b overflow-x-auto">
          <nav className="flex -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
                {tab.id === "applications" && needsAttention > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                    {needsAttention}
                  </span>
                )}
                {tab.id === "inbox" && inboundEmails.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                    {inboundEmails.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "overview" && (
            <OverviewTab
              seeker={seeker}
              references={references}
              documents={documents}
            />
          )}
          {activeTab === "profile" && (
            <ProfileTab seeker={seeker} />
          )}
          {activeTab === "jobs" && (
            <JobsTab
              matchedJobs={matchedJobs}
              threshold={threshold}
              seekerId={seeker.id}
              initialWeights={seeker.match_weights}
            />
          )}
          {activeTab === "applications" && (
            <ApplicationsTab queueItems={queueItems} runs={runs} />
          )}
          {activeTab === "outreach" && (
            <OutreachTab drafts={outreachDrafts} threads={recruiterThreads} />
          )}
          {activeTab === "interviews" && (
            <InterviewsTab interviews={interviews} />
          )}
          {activeTab === "prep" && (
            <PrepTab prep={interviewPrep} seekerId={seeker.id} />
          )}
          {activeTab === "inbox" && (
            <InboxTab emails={inboundEmails} gmailConnection={gmailConnection} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "blue" | "green" | "orange" | "purple";
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-green-600",
    orange: "text-orange-600",
    purple: "text-purple-600",
  };
  const colorClass = color ? colorClasses[color] : "text-gray-900";

  return (
    <div className="px-4 py-2 bg-gray-50 rounded-lg">
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function OverviewTab({
  seeker,
  references,
  documents,
}: {
  seeker: SeekerData;
  references: Reference[];
  documents: Document[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Profile Info */}
      <div className="space-y-6">
        <Section title="Contact Information">
          <dl className="space-y-2">
            <InfoRow label="Email" value={seeker.email} />
            <InfoRow label="Phone" value={seeker.phone || "Not provided"} />
            <InfoRow label="LinkedIn" value={seeker.linkedin_url} link />
            <InfoRow label="Portfolio" value={seeker.portfolio_url} link />
          </dl>
        </Section>

        <Section title="Target Titles">
          {seeker.target_titles && seeker.target_titles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {seeker.target_titles.map((t) => (
                <span key={t} className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No target titles set</p>
          )}
        </Section>

        <Section title="Skills">
          {seeker.skills && seeker.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {seeker.skills.map((s) => (
                <span key={s} className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No skills listed</p>
          )}
        </Section>
      </div>

      {/* Documents & References */}
      <div className="space-y-6">
        <Section title="Documents">
          {documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{doc.file_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{doc.doc_type}</p>
                  </div>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No documents uploaded</p>
          )}
        </Section>

        <Section title="References">
          {references.length > 0 ? (
            <div className="space-y-3">
              {references.map((ref) => (
                <div key={ref.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{ref.name}</p>
                  {ref.title && (
                    <p className="text-sm text-gray-600">
                      {ref.title}
                      {ref.company && ` at ${ref.company}`}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 capitalize mt-1">{ref.relationship}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No references added</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function ProfileTab({ seeker }: { seeker: SeekerData }) {
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysis, setAnalysis] = useState<{ analysis: string; rating: string } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/am/seekers/${seeker.id}/profile-analysis`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setAnalysisError(data.error || "Failed to analyze profile.");
        return;
      }
      const data = await res.json();
      setAnalysis(data);
    } catch {
      setAnalysisError("Network error.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const completion = seeker.profile_completion ?? 0;

  const boolLabel = (val: boolean | null) =>
    val === true ? "Yes" : val === false ? "No" : "—";

  return (
    <div className="space-y-6">
      {/* Profile Completion */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Profile Completion</h3>
          <span className="text-lg font-bold text-blue-600">{completion}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${completion >= 80 ? "bg-green-500" : completion >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      {/* AI Analysis */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">AI Profile Analysis</h3>
          <button
            onClick={runAnalysis}
            disabled={analysisLoading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {analysisLoading ? "Analyzing..." : "Analyze Profile"}
          </button>
        </div>
        {analysisError && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{analysisError}</p>
        )}
        {analysis && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Rating:</span>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                analysis.rating === "Ready" ? "bg-green-100 text-green-800" :
                analysis.rating === "Needs Work" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              }`}>
                {analysis.rating}
              </span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-4 rounded-lg border">
              {analysis.analysis}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Info */}
        <Section title="Personal Information">
          <dl className="space-y-2">
            <InfoRow label="Name" value={seeker.full_name} />
            <InfoRow label="Email" value={seeker.email} />
            <InfoRow label="Phone" value={seeker.phone || "—"} />
            <InfoRow label="Location" value={seeker.location || "—"} />
            <InfoRow label="LinkedIn" value={seeker.linkedin_url} link />
            <InfoRow label="Portfolio" value={seeker.portfolio_url} link />
          </dl>
          {(seeker.address_line1 || seeker.address_city) && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium text-gray-500 mb-1">Address</p>
              <p className="text-sm text-gray-700">
                {[seeker.address_line1, seeker.address_city, seeker.address_state, seeker.address_zip, seeker.address_country].filter(Boolean).join(", ")}
              </p>
            </div>
          )}
        </Section>

        {/* Bio */}
        <Section title="Bio">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {seeker.bio || "No bio provided."}
          </p>
        </Section>

        {/* Job Preferences */}
        <Section title="Job Preferences">
          <dl className="space-y-2">
            <InfoRow label="Seniority" value={seeker.seniority || "—"} />
            <InfoRow label="Years of Experience" value={seeker.years_experience != null ? String(seeker.years_experience) : "—"} />
            <InfoRow label="Salary Range" value={
              seeker.salary_min || seeker.salary_max
                ? `$${(seeker.salary_min ?? 0).toLocaleString()} – $${(seeker.salary_max ?? 0).toLocaleString()}`
                : "—"
            } />
            <InfoRow label="Open to Relocation" value={boolLabel(seeker.open_to_relocation)} />
          </dl>
          {seeker.target_titles && seeker.target_titles.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Target Titles</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.target_titles.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
          {seeker.work_type_preferences && seeker.work_type_preferences.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Work Types</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.work_type_preferences.map((w) => (
                  <span key={w} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full capitalize">{w}</span>
                ))}
              </div>
            </div>
          )}
          {seeker.employment_type_preferences && seeker.employment_type_preferences.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Employment Types</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.employment_type_preferences.map((e) => (
                  <span key={e} className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full capitalize">{e}</span>
                ))}
              </div>
            </div>
          )}
          {seeker.location_preferences && seeker.location_preferences.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Location Preferences</p>
              <div className="space-y-1">
                {seeker.location_preferences.map((lp, i) => (
                  <p key={i} className="text-sm text-gray-700">
                    <span className="font-medium capitalize">{lp.work_type}:</span> {lp.locations.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Skills */}
        <Section title="Skills">
          {seeker.skills && seeker.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {seeker.skills.map((s) => (
                <span key={s} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">{s}</span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No skills listed</p>
          )}
        </Section>

        {/* Work History */}
        <Section title="Work History">
          {seeker.work_history && seeker.work_history.length > 0 ? (
            <div className="space-y-3">
              {seeker.work_history.map((entry, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border">
                  <p className="font-medium text-gray-900">{entry.title}</p>
                  <p className="text-sm text-gray-600">{entry.company}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.start_date} – {entry.current ? "Present" : entry.end_date}
                  </p>
                  {entry.description && (
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{entry.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No work history</p>
          )}
        </Section>

        {/* Education */}
        <Section title="Education">
          {seeker.education && seeker.education.length > 0 ? (
            <div className="space-y-3">
              {seeker.education.map((entry, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border">
                  <p className="font-medium text-gray-900">{entry.degree}</p>
                  <p className="text-sm text-gray-600">{entry.school}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.field}{entry.graduation_year ? ` (${entry.graduation_year})` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No education listed</p>
          )}
        </Section>

        {/* Industries & Company Sizes */}
        <Section title="Industries & Company Sizes">
          {seeker.preferred_industries && seeker.preferred_industries.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Preferred Industries</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.preferred_industries.map((ind) => (
                  <span key={ind} className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">{ind}</span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm mb-2">No preferred industries</p>
          )}
          {seeker.preferred_company_sizes && seeker.preferred_company_sizes.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Preferred Company Sizes</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.preferred_company_sizes.map((sz) => (
                  <span key={sz} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs rounded-full">{sz}</span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No preferred company sizes</p>
          )}
        </Section>

        {/* Work Authorization */}
        <Section title="Work Authorization">
          <dl className="space-y-2">
            <InfoRow label="Authorized to Work" value={boolLabel(seeker.authorized_to_work)} />
            <InfoRow label="Requires Visa Sponsorship" value={boolLabel(seeker.requires_visa_sponsorship)} />
            <InfoRow label="Citizenship Status" value={seeker.citizenship_status || "—"} />
            <InfoRow label="Requires H1B Transfer" value={boolLabel(seeker.requires_h1b_transfer)} />
            <InfoRow label="Needs Employer Sponsorship" value={boolLabel(seeker.needs_employer_sponsorship)} />
          </dl>
        </Section>

        {/* Availability */}
        <Section title="Availability">
          <dl className="space-y-2">
            <InfoRow label="Start Date" value={seeker.start_date || "—"} />
            <InfoRow label="Notice Period" value={seeker.notice_period || "—"} />
            <InfoRow label="Available for Relocation" value={boolLabel(seeker.available_for_relocation)} />
            <InfoRow label="Available for Travel" value={boolLabel(seeker.available_for_travel)} />
            <InfoRow label="Willing to Work Overtime" value={boolLabel(seeker.willing_to_work_overtime)} />
            <InfoRow label="Willing to Work Weekends" value={boolLabel(seeker.willing_to_work_weekends)} />
            <InfoRow label="Preferred Shift" value={seeker.preferred_shift || "—"} />
            <InfoRow label="Open to Contract" value={boolLabel(seeker.open_to_contract)} />
          </dl>
        </Section>
      </div>
    </div>
  );
}

function JobsTab({
  matchedJobs,
  threshold,
  seekerId,
  initialWeights,
}: {
  matchedJobs: MatchedJob[];
  threshold: number;
  seekerId: string;
  initialWeights: ScoringWeights | null;
}) {
  const [filter, setFilter] = useState<"all" | "above" | "below">("above");
  const [currentThreshold, setCurrentThreshold] = useState(threshold);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights] = useState<ScoringWeights>(initialWeights ?? DEFAULT_WEIGHTS);
  const [savingWeights, setSavingWeights] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filtered = matchedJobs.filter((m) => {
    if (filter === "above") return m.score >= currentThreshold && m.routingDecision !== "OVERRIDDEN_OUT";
    if (filter === "below") return m.score < currentThreshold || m.routingDecision === "OVERRIDDEN_OUT";
    return true;
  });

  const saveThreshold = async () => {
    setSavingThreshold(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_threshold: currentThreshold }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Threshold saved!" });
      } else {
        setMessage({ type: "error", text: "Failed to save threshold." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setSavingThreshold(false);
  };

  const saveWeights = async () => {
    setSavingWeights(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_weights: weights }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Scoring weights saved! Run Match Now to recalculate." });
      } else {
        setMessage({ type: "error", text: "Failed to save weights." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setSavingWeights(false);
  };

  const resetWeights = () => {
    setWeights({ ...DEFAULT_WEIGHTS });
  };

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const totalWeight = weights.skills + weights.title + weights.experience + weights.salary + weights.location + weights.company_fit;

  const runMatchNow = async () => {
    setRunningMatch(true);
    setMessage(null);
    try {
      const res = await fetch("/api/match/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: "success", text: `Matching complete! Scored ${data.matched} jobs. Refresh to see results.` });
      } else {
        setMessage({ type: "error", text: "Failed to run matching." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setRunningMatch(false);
  };

  const addToQueue = async (jobPostId: string) => {
    try {
      await fetch("/api/am/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, job_post_id: jobPostId }),
      });
      setMessage({ type: "success", text: "Added to application queue!" });
    } catch {
      setMessage({ type: "error", text: "Failed to add to queue." });
    }
  };

  const weightLabels: Record<keyof ScoringWeights, { label: string; description: string; color: string }> = {
    skills: { label: "Skills Match", description: "How well seeker's skills match job requirements", color: "blue" },
    title: { label: "Title Match", description: "Alignment between target titles and job title", color: "indigo" },
    experience: { label: "Experience", description: "Years of experience fit", color: "green" },
    salary: { label: "Salary Fit", description: "Salary range overlap", color: "emerald" },
    location: { label: "Location", description: "Location and remote/hybrid preferences", color: "purple" },
    company_fit: { label: "Company Fit", description: "Industry and company size preferences", color: "orange" },
    max_penalty: { label: "Max Penalty", description: "Max deduction for exclude keywords and visa mismatch", color: "red" },
  };

  return (
    <div className="space-y-4">
      {/* Threshold Controls */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-purple-800">Match Threshold:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={currentThreshold}
              onChange={(e) => setCurrentThreshold(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-lg font-bold text-purple-700 w-12">{currentThreshold}%</span>
          </div>
          <button
            onClick={saveThreshold}
            disabled={savingThreshold || currentThreshold === threshold}
            className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {savingThreshold ? "Saving..." : "Save"}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowWeights(!showWeights)}
            className="px-3 py-1 text-sm border border-purple-300 text-purple-700 rounded hover:bg-purple-100"
          >
            {showWeights ? "Hide Weights" : "Adjust Weights"}
          </button>
          <button
            onClick={runMatchNow}
            disabled={runningMatch}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {runningMatch ? "Running..." : "Run Match Now"}
          </button>
        </div>
        <p className="text-xs text-purple-600 mt-2">
          Jobs scoring above this threshold will be available in the extension for applying.
        </p>
      </div>

      {/* Scoring Weight Controls */}
      {showWeights && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-gray-900">Scoring Weights</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Adjust how much each factor contributes to the match score. Total positive weights: {totalWeight}/100.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetWeights}
                className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
              >
                Reset to Defaults
              </button>
              <button
                onClick={saveWeights}
                disabled={savingWeights}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {savingWeights ? "Saving..." : "Save Weights"}
              </button>
            </div>
          </div>

          {totalWeight !== 100 && (
            <div className={`p-2 rounded text-xs ${totalWeight > 100 ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}`}>
              Positive weights sum to {totalWeight}. For balanced scoring, aim for a total of 100.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.entries(weightLabels) as [keyof ScoringWeights, typeof weightLabels[keyof ScoringWeights]][]).map(
              ([key, { label, description, color }]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    <span className={`text-sm font-bold ${key === "max_penalty" ? "text-red-600" : "text-gray-900"}`}>
                      {key === "max_penalty" ? `-${weights[key]}` : weights[key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={key === "max_penalty" ? 30 : 50}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-gray-400">{description}</p>
                </div>
              )
            )}
          </div>

          {/* Visual weight distribution */}
          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-1">Weight Distribution</p>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
              {totalWeight > 0 && (
                <>
                  <div style={{ width: `${(weights.skills / totalWeight) * 100}%` }} className="bg-blue-500" title={`Skills: ${weights.skills}`} />
                  <div style={{ width: `${(weights.title / totalWeight) * 100}%` }} className="bg-indigo-500" title={`Title: ${weights.title}`} />
                  <div style={{ width: `${(weights.experience / totalWeight) * 100}%` }} className="bg-green-500" title={`Experience: ${weights.experience}`} />
                  <div style={{ width: `${(weights.salary / totalWeight) * 100}%` }} className="bg-emerald-500" title={`Salary: ${weights.salary}`} />
                  <div style={{ width: `${(weights.location / totalWeight) * 100}%` }} className="bg-purple-500" title={`Location: ${weights.location}`} />
                  <div style={{ width: `${(weights.company_fit / totalWeight) * 100}%` }} className="bg-orange-500" title={`Company Fit: ${weights.company_fit}`} />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Skills</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Title</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Experience</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Salary</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Location</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Company</span>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("above")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "above" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Above Threshold ({matchedJobs.filter((m) => m.score >= currentThreshold).length})
          </button>
          <button
            onClick={() => setFilter("below")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "below" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Below Threshold
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            All ({matchedJobs.length})
          </button>
        </div>
        <span className="text-sm text-gray-500">{filtered.length} jobs</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No jobs match this filter</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`p-4 border rounded-lg ${
                m.score >= currentThreshold ? "border-green-200 bg-green-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{m.job?.title || "Unknown Job"}</h4>
                  <p className="text-sm text-gray-600">{m.job?.company} - {m.job?.location}</p>
                  {m.job?.url && (
                    <a
                      href={m.job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 mt-1 inline-block"
                    >
                      View Posting →
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${m.score >= currentThreshold ? "text-green-600" : "text-gray-400"}`}>
                      {m.score}
                    </div>
                    <div className="text-xs text-gray-500">match</div>
                  </div>
                  {m.score >= currentThreshold && m.routingDecision !== "OVERRIDDEN_OUT" && m.job && (
                    <button
                      onClick={() => addToQueue(m.job!.id)}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Queue
                    </button>
                  )}
                </div>
              </div>
              {m.routingDecision && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                    {m.routingDecision.replace(/_/g, " ")}
                  </span>
                  {m.routingNote && <span className="text-xs text-gray-500">{m.routingNote}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationsTab({
  queueItems,
  runs,
}: {
  queueItems: QueueItem[];
  runs: RunItem[];
}) {
  const [filter, setFilter] = useState<"all" | "queued" | "running" | "applied" | "attention" | "failed">("all");

  // Combine and sort
  const allItems = [
    ...queueItems.filter((q) => q.status === "QUEUED").map((q) => ({
      id: q.id,
      type: "queue" as const,
      status: q.status,
      job: q.job_posts,
      date: q.created_at,
      error: null,
    })),
    ...runs.map((r) => ({
      id: r.id,
      type: "run" as const,
      status: r.status,
      job: r.job_posts,
      date: r.updated_at,
      error: r.last_error,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = allItems.filter((item) => {
    if (filter === "queued") return item.status === "QUEUED";
    if (filter === "running") return ["RUNNING", "PAUSED", "READY", "RETRYING"].includes(item.status);
    if (filter === "applied") return ["APPLIED", "COMPLETED"].includes(item.status);
    if (filter === "attention") return item.status === "NEEDS_ATTENTION";
    if (filter === "failed") return item.status === "FAILED";
    return true;
  });

  const counts = {
    queued: allItems.filter((i) => i.status === "QUEUED").length,
    running: allItems.filter((i) => ["RUNNING", "PAUSED", "READY", "RETRYING"].includes(i.status)).length,
    applied: allItems.filter((i) => ["APPLIED", "COMPLETED"].includes(i.status)).length,
    attention: allItems.filter((i) => i.status === "NEEDS_ATTENTION").length,
    failed: allItems.filter((i) => i.status === "FAILED").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          All ({allItems.length})
        </FilterButton>
        <FilterButton active={filter === "queued"} onClick={() => setFilter("queued")}>
          Queued ({counts.queued})
        </FilterButton>
        <FilterButton active={filter === "running"} onClick={() => setFilter("running")}>
          In Progress ({counts.running})
        </FilterButton>
        <FilterButton active={filter === "applied"} onClick={() => setFilter("applied")}>
          Applied ({counts.applied})
        </FilterButton>
        {counts.attention > 0 && (
          <FilterButton active={filter === "attention"} onClick={() => setFilter("attention")} highlight>
            Needs Attention ({counts.attention})
          </FilterButton>
        )}
        <FilterButton active={filter === "failed"} onClick={() => setFilter("failed")}>
          Failed ({counts.failed})
        </FilterButton>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No applications match this filter</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={`${item.type}-${item.id}`} className="p-4 border rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{item.job?.title || "Unknown"}</h4>
                  <p className="text-sm text-gray-600">{item.job?.company}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(item.date).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.error && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                  {item.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutreachTab({
  drafts,
  threads,
}: {
  drafts: OutreachDraft[];
  threads: RecruiterThread[];
}) {
  const [view, setView] = useState<"drafts" | "threads">("drafts");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setView("drafts")}
          className={`px-4 py-2 text-sm rounded-lg ${
            view === "drafts" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Drafts ({drafts.length})
        </button>
        <button
          onClick={() => setView("threads")}
          className={`px-4 py-2 text-sm rounded-lg ${
            view === "threads" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Recruiter Threads ({threads.length})
        </button>
      </div>

      {view === "drafts" && (
        drafts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No outreach drafts</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {draft.outreach_contacts?.full_name || "Unknown Contact"}
                    </p>
                    <p className="text-sm text-gray-600">{draft.outreach_contacts?.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {draft.job_posts?.company} - {draft.job_posts?.title}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    draft.status === "SENT" ? "bg-green-100 text-green-800" :
                    draft.status === "DRAFT" ? "bg-gray-100 text-gray-600" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {draft.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === "threads" && (
        threads.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No recruiter threads</p>
        ) : (
          <div className="space-y-2">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/dashboard/outreach/threads/${thread.id}`}
                className="block p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{thread.recruiters?.name || "Unknown"}</p>
                    <p className="text-sm text-gray-600">
                      {thread.recruiters?.title} at {thread.recruiters?.company}
                    </p>
                    {thread.next_follow_up_at && (
                      <p className="text-xs text-orange-600 mt-1">
                        Follow-up: {new Date(thread.next_follow_up_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    thread.thread_status === "ACTIVE" ? "bg-green-100 text-green-800" :
                    thread.thread_status === "FOLLOW_UP_DUE" ? "bg-orange-100 text-orange-800" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {thread.thread_status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function InterviewsTab({ interviews }: { interviews: Interview[] }) {
  const now = new Date();
  const upcoming = interviews.filter((i) => new Date(i.scheduled_at) >= now && i.status === "confirmed");
  const past = interviews.filter((i) => new Date(i.scheduled_at) < now || i.status !== "confirmed");

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Upcoming Interviews</h3>
          <div className="space-y-2">
            {upcoming.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Past Interviews</h3>
          <div className="space-y-2">
            {past.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} />
            ))}
          </div>
        </div>
      )}

      {interviews.length === 0 && (
        <p className="text-gray-500 text-center py-8">No interviews scheduled</p>
      )}
    </div>
  );
}

function InterviewCard({ interview }: { interview: Interview }) {
  const date = new Date(interview.scheduled_at);
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{interview.job_posts?.company}</h4>
          <p className="text-sm text-gray-600">{interview.job_posts?.title}</p>
          <div className="flex gap-2 mt-2">
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded capitalize">
              {interview.interview_type}
            </span>
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {interview.duration_min} min
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-medium text-gray-900">{date.toLocaleDateString()}</p>
          <p className="text-sm text-gray-600">
            {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full ${
            interview.status === "confirmed" ? "bg-green-100 text-green-800" :
            interview.status === "completed" ? "bg-blue-100 text-blue-800" :
            interview.status === "cancelled" ? "bg-red-100 text-red-800" :
            "bg-gray-100 text-gray-600"
          }`}>
            {interview.status}
          </span>
        </div>
      </div>
      {interview.meeting_link && (
        <a
          href={interview.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-800 mt-3 inline-block"
        >
          Join Meeting →
        </a>
      )}
    </div>
  );
}

function PrepTab({
  prep,
  seekerId,
}: {
  prep: InterviewPrep[];
  seekerId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Interview Prep Materials</h3>
        <Link
          href={`/dashboard/interview-prep?seeker=${seekerId}`}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Generate New →
        </Link>
      </div>

      {prep.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No prep materials generated yet</p>
      ) : (
        <div className="space-y-2">
          {prep.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/interview-prep/${p.id}`}
              className="block p-4 border rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{p.job_posts?.company}</h4>
                  <p className="text-sm text-gray-600">{p.job_posts?.title}</p>
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const CLASSIFICATION_LABELS: Record<string, { label: string; color: string }> = {
  rejection: { label: "Rejection", color: "bg-red-100 text-red-800" },
  interview_invite: { label: "Interview Invite", color: "bg-green-100 text-green-800" },
  offer: { label: "Offer", color: "bg-emerald-100 text-emerald-800" },
  follow_up: { label: "Follow-up", color: "bg-blue-100 text-blue-800" },
  verification: { label: "Verification", color: "bg-yellow-100 text-yellow-800" },
  application_confirmation: { label: "Confirmation", color: "bg-indigo-100 text-indigo-800" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

function InboxTab({
  emails,
  gmailConnection,
}: {
  emails: InboundEmail[];
  gmailConnection: GmailConnectionInfo | null;
}) {
  const [filter, setFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyResult, setReplyResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleReply = async () => {
    if (!selectedEmail || !replyBody.trim()) return;
    setReplying(true);
    setReplyResult(null);
    try {
      const res = await fetch("/api/am/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: selectedEmail.id,
          body: replyBody,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyResult({ type: "success", text: "Reply sent successfully!" });
        setReplyBody("");
      } else {
        setReplyResult({
          type: "error",
          text: data.error || "Failed to send reply.",
        });
      }
    } catch {
      setReplyResult({ type: "error", text: "Failed to send reply." });
    } finally {
      setReplying(false);
    }
  };

  if (!gmailConnection) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Gmail is not connected for this seeker.</p>
        <p className="text-sm text-gray-400 mt-1">
          Ask them to connect Gmail in their Portal profile to enable inbox scanning.
        </p>
      </div>
    );
  }

  // Count by classification
  const counts: Record<string, number> = {};
  for (const e of emails) {
    counts[e.classification] = (counts[e.classification] ?? 0) + 1;
  }

  const filtered =
    filter === "all" ? emails : emails.filter((e) => e.classification === filter);

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "interview_invite", label: "Interview Invites" },
    { value: "offer", label: "Offers" },
    { value: "rejection", label: "Rejections" },
    { value: "follow_up", label: "Follow-ups" },
    { value: "application_confirmation", label: "Confirmations" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Connected: <span className="font-medium text-gray-900">{gmailConnection.email}</span>
          </p>
          <p className="text-xs text-gray-400">
            Since {new Date(gmailConnection.connectedAt).toLocaleDateString()}
          </p>
        </div>
        <span className="text-sm text-gray-500">{emails.length} emails scanned</span>
      </div>

      {/* Classification summary */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => {
          const count = opt.value === "all" ? emails.length : counts[opt.value] ?? 0;
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No emails match this filter</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Email list */}
          <div className="space-y-2">
            {filtered.map((email) => {
              const cls =
                CLASSIFICATION_LABELS[email.classification] ??
                CLASSIFICATION_LABELS.other;
              const isSelected = selectedEmail?.id === email.id;
              return (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelectedEmail(email);
                    setReplyBody("");
                    setReplyResult(null);
                  }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {email.from_name || email.from_email}
                      </p>
                      <p className="text-sm text-gray-700 truncate">
                        {email.subject || "(no subject)"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {email.body_snippet}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls.color}`}
                      >
                        {cls.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(email.received_at).toLocaleDateString()}
                      </span>
                      {email.classification_confidence > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {Math.round(email.classification_confidence * 100)}% conf
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail + Reply panel */}
          {selectedEmail && (
            <div className="bg-white rounded-lg border p-5 sticky top-4">
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedEmail.subject || "(no subject)"}
                  </p>
                  <p className="text-sm text-gray-600">
                    From: {selectedEmail.from_name}{" "}
                    <span className="text-gray-400">
                      &lt;{selectedEmail.from_email}&gt;
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(selectedEmail.received_at).toLocaleString()}
                  </p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedEmail.body_snippet}
                  </p>
                </div>

                {/* Reply section */}
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    Reply (as seeker via Gmail)
                  </h4>

                  {replyResult && (
                    <div
                      className={`p-2 rounded text-sm mb-2 ${
                        replyResult.type === "success"
                          ? "bg-green-50 text-green-800"
                          : "bg-red-50 text-red-800"
                      }`}
                    >
                      {replyResult.text}
                    </div>
                  )}

                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type a reply on behalf of the seeker..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                  <button
                    onClick={handleReply}
                    disabled={replying || !replyBody.trim()}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {replying ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Utility components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500 text-sm">{label}</dt>
      <dd className="text-gray-900 text-sm">
        {link && value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
            {value.replace(/^https?:\/\//, "").slice(0, 30)}...
          </a>
        ) : (
          value || "-"
        )}
      </dd>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  highlight,
  children,
}: {
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded-lg ${
        active
          ? highlight
            ? "bg-orange-600 text-white"
            : "bg-blue-600 text-white"
          : highlight
          ? "bg-orange-100 text-orange-800"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUED: "bg-yellow-100 text-yellow-800",
    RUNNING: "bg-blue-100 text-blue-800",
    PAUSED: "bg-gray-100 text-gray-800",
    READY: "bg-blue-100 text-blue-800",
    RETRYING: "bg-blue-100 text-blue-800",
    APPLIED: "bg-green-100 text-green-800",
    COMPLETED: "bg-green-100 text-green-800",
    NEEDS_ATTENTION: "bg-orange-100 text-orange-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
