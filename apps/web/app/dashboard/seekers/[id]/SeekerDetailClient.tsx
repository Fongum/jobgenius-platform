"use client";

import { useState } from "react";
import Link from "next/link";

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
  education: unknown[] | null;
  work_history: unknown[] | null;
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

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "jobs", label: "Jobs" },
  { id: "applications", label: "Applications" },
  { id: "outreach", label: "Outreach" },
  { id: "interviews", label: "Interviews" },
  { id: "prep", label: "Prep" },
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
          {activeTab === "jobs" && (
            <JobsTab
              matchedJobs={matchedJobs}
              threshold={threshold}
              seekerId={seeker.id}
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

function JobsTab({
  matchedJobs,
  threshold,
  seekerId,
}: {
  matchedJobs: MatchedJob[];
  threshold: number;
  seekerId: string;
}) {
  const [filter, setFilter] = useState<"all" | "above" | "below">("above");

  const filtered = matchedJobs.filter((m) => {
    if (filter === "above") return m.score >= threshold && m.routingDecision !== "OVERRIDDEN_OUT";
    if (filter === "below") return m.score < threshold || m.routingDecision === "OVERRIDDEN_OUT";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("above")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "above" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Above Threshold ({matchedJobs.filter((m) => m.score >= threshold).length})
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
        <span className="text-sm text-gray-500">Threshold: {threshold}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No jobs match this filter</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`p-4 border rounded-lg ${
                m.score >= threshold ? "border-green-200 bg-green-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{m.job?.title || "Unknown Job"}</h4>
                  <p className="text-sm text-gray-600">{m.job?.company} - {m.job?.location}</p>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold ${m.score >= threshold ? "text-green-600" : "text-gray-400"}`}>
                    {m.score}
                  </span>
                  {m.routingDecision && (
                    <p className="text-xs text-orange-600 mt-1">{m.routingDecision}</p>
                  )}
                </div>
              </div>
              {m.job?.url && (
                <a
                  href={m.job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
                >
                  View Job Posting →
                </a>
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
