"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ResumePreview from "./ResumePreview";
import type { StructuredResume, ResumeTemplateId } from "@/lib/resume-templates/types";
import { RESUME_TEMPLATES } from "@/lib/resume-templates/types";

// ─── Types ──────────────────────────────────────────────────────────

interface SeekerSummary {
  id: string;
  full_name: string | null;
  email: string;
  match_threshold: number | null;
  resume_text: string | null;
  resume_template_id: ResumeTemplateId | null;
}

interface JobData {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  description_text: string | null;
}

interface MatchScore {
  id: string;
  score: number;
  recommendation: string | null;
  reasons: Record<string, unknown> | null;
  job_seeker_id: string;
  job_posts: JobData | null;
}

interface RoutingDecision {
  job_post_id: string;
  job_seeker_id: string;
  decision: string;
  note: string | null;
}

interface QueueItem {
  id: string;
  status: string;
  category: string | null;
  created_at: string;
  updated_at: string | null;
  last_error: string | null;
  job_seeker_id: string;
  job_post_id: string;
  job_posts: JobData | null;
  job_seekers: { id: string; full_name: string | null } | null;
}

interface RunItem {
  id: string;
  status: string;
  current_step: string | null;
  last_error: string | null;
  ats_type: string | null;
  needs_attention_reason: string | null;
  created_at: string;
  updated_at: string;
  job_seeker_id: string;
  job_post_id: string;
  queue_id: string | null;
  job_posts: { id: string; title: string; company: string | null; location: string | null; url: string } | null;
  job_seekers: { id: string; full_name: string | null } | null;
}

interface OutreachContact {
  id: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
  job_post_id: string;
  job_seeker_id: string;
}

interface OutreachDraft {
  id: string;
  subject: string | null;
  body: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  job_seeker_id: string;
  job_posts: { id: string; title: string; company: string | null } | null;
  outreach_contacts: { id: string; full_name: string | null; email: string | null; role: string | null } | null;
}

interface TailoredResume {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  tailored_text: string;
  changes_summary: string | null;
  tailored_data: StructuredResume | null;
  template_id: ResumeTemplateId | null;
  resume_url: string | null;
}

interface PipelineClientProps {
  seekers: SeekerSummary[];
  matchScores: MatchScore[];
  availableJobsCount: number;
  routingDecisions: RoutingDecision[];
  queueItems: QueueItem[];
  runs: RunItem[];
  outreachContacts: OutreachContact[];
  outreachDrafts: OutreachDraft[];
  tailoredResumes: TailoredResume[];
}

const TABS = [
  { id: "discover", label: "Discover" },
  { id: "queue", label: "Queue" },
  { id: "resumes", label: "Resumes" },
  { id: "applied", label: "Applied" },
  { id: "followup", label: "Follow Up" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Main Component ─────────────────────────────────────────────────

export default function PipelineClient({
  seekers,
  matchScores,
  availableJobsCount,
  routingDecisions,
  queueItems,
  runs,
  outreachContacts,
  outreachDrafts,
  tailoredResumes,
}: PipelineClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as TabId) || "discover";
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "discover"
  );
  const [selectedSeeker, setSelectedSeeker] = useState<string>("all");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/dashboard/pipeline?tab=${tab}`, { scroll: false });
  };

  // Build lookup maps
  const seekerMap = useMemo(() => new Map(seekers.map((s) => [s.id, s])), [seekers]);
  const routingMap = useMemo(() => {
    const m = new Map<string, RoutingDecision>();
    routingDecisions.forEach((d) => m.set(`${d.job_seeker_id}:${d.job_post_id}`, d));
    return m;
  }, [routingDecisions]);
  const queuedSet = useMemo(() => {
    const s = new Set<string>();
    queueItems.forEach((q) => s.add(`${q.job_seeker_id}:${q.job_post_id}`));
    return s;
  }, [queueItems]);
  const appliedSet = useMemo(() => {
    const s = new Set<string>();
    runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status))
      .forEach((r) => s.add(`${r.job_seeker_id}:${r.job_post_id}`));
    return s;
  }, [runs]);
  const tailoredMap = useMemo(() => {
    const m = new Map<string, TailoredResume>();
    tailoredResumes.forEach((t) => m.set(`${t.job_seeker_id}:${t.job_post_id}`, t));
    return m;
  }, [tailoredResumes]);

  // Run map keyed by queue_id
  const runByQueueId = useMemo(() => {
    const m = new Map<string, RunItem>();
    runs.forEach((r) => { if (r.queue_id) m.set(r.queue_id, r); });
    return m;
  }, [runs]);

  // Stats
  const filteredMatches = useMemo(() => {
    return matchScores.filter((m) => {
      if (selectedSeeker !== "all" && m.job_seeker_id !== selectedSeeker) return false;
      const seeker = seekerMap.get(m.job_seeker_id);
      const threshold = seeker?.match_threshold ?? 60;
      const routing = routingMap.get(`${m.job_seeker_id}:${m.job_posts?.id}`);
      return m.score >= threshold && routing?.decision !== "OVERRIDDEN_OUT";
    });
  }, [matchScores, selectedSeeker, seekerMap, routingMap]);

  const filteredQueue = useMemo(
    () => queueItems.filter((q) => selectedSeeker === "all" || q.job_seeker_id === selectedSeeker),
    [queueItems, selectedSeeker]
  );
  const filteredRuns = useMemo(
    () => runs.filter((r) => selectedSeeker === "all" || r.job_seeker_id === selectedSeeker),
    [runs, selectedSeeker]
  );

  const queuedCount = filteredQueue.filter((q) => q.status === "QUEUED").length;
  const runningCount = filteredRuns.filter((r) => ["RUNNING", "READY", "RETRYING"].includes(r.status)).length;
  const needsAttentionCount = filteredRuns.filter((r) => r.status === "NEEDS_ATTENTION").length;
  const appliedCount = filteredRuns.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status)).length;
  const pendingFollowUp = useMemo(() => {
    const appliedCompanies = new Set<string>();
    filteredRuns
      .filter((r) => ["APPLIED", "COMPLETED"].includes(r.status))
      .forEach((r) => {
        if (r.job_posts?.company) appliedCompanies.add(r.job_posts.company);
      });
    const contactedCompanies = new Set<string>();
    outreachDrafts
      .filter((d) => selectedSeeker === "all" || d.job_seeker_id === selectedSeeker)
      .forEach((d) => {
        if (d.job_posts?.company) contactedCompanies.add(d.job_posts.company);
      });
    let count = 0;
    appliedCompanies.forEach((c) => { if (!contactedCompanies.has(c)) count++; });
    return count;
  }, [filteredRuns, outreachDrafts, selectedSeeker]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Job Hub</h1>
          <select
            value={selectedSeeker}
            onChange={(e) => setSelectedSeeker(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Seekers</option>
            {seekers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mt-4">
          <StatBox label="Available in Job Bank" value={availableJobsCount} color="blue" />
          <StatBox label="Matched Jobs" value={filteredMatches.length} />
          <StatBox label="In Queue" value={queuedCount} color="blue" />
          <StatBox label="Running" value={runningCount} color="blue" />
          {needsAttentionCount > 0 && (
            <StatBox label="Needs Attention" value={needsAttentionCount} color="orange" />
          )}
          <StatBox label="Applied" value={appliedCount} color="green" />
          {pendingFollowUp > 0 && (
            <StatBox label="Pending Follow-up" value={pendingFollowUp} color="purple" />
          )}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b overflow-x-auto">
          <nav className="flex -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
                {tab.id === "queue" && needsAttentionCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                    {needsAttentionCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "discover" && (
            <DiscoverTab
              matchScores={matchScores}
              availableJobsCount={availableJobsCount}
              seekers={seekers}
              seekerMap={seekerMap}
              routingMap={routingMap}
              queuedSet={queuedSet}
              appliedSet={appliedSet}
              selectedSeeker={selectedSeeker}
              setMsg={setMsg}
            />
          )}
          {activeTab === "queue" && (
            <QueueTab
              queueItems={filteredQueue}
              runByQueueId={runByQueueId}
              setMsg={setMsg}
              switchTab={switchTab}
            />
          )}
          {activeTab === "resumes" && (
            <ResumesTab
              queueItems={filteredQueue}
              seekerMap={seekerMap}
              tailoredMap={tailoredMap}
              setMsg={setMsg}
            />
          )}
          {activeTab === "applied" && (
            <AppliedTab
              runs={filteredRuns}
              seekerMap={seekerMap}
              setMsg={setMsg}
              switchTab={switchTab}
            />
          )}
          {activeTab === "followup" && (
            <FollowUpTab
              runs={filteredRuns}
              outreachContacts={outreachContacts.filter(
                (c) => selectedSeeker === "all" || c.job_seeker_id === selectedSeeker
              )}
              outreachDrafts={outreachDrafts.filter(
                (d) => selectedSeeker === "all" || d.job_seeker_id === selectedSeeker
              )}
              seekerMap={seekerMap}
              setMsg={setMsg}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Discover Tab ───────────────────────────────────────────────────

function DiscoverTab({
  matchScores,
  availableJobsCount,
  seekers,
  seekerMap,
  routingMap,
  queuedSet,
  appliedSet,
  selectedSeeker,
  setMsg,
}: {
  matchScores: MatchScore[];
  availableJobsCount: number;
  seekers: SeekerSummary[];
  seekerMap: Map<string, SeekerSummary>;
  routingMap: Map<string, RoutingDecision>;
  queuedSet: Set<string>;
  appliedSet: Set<string>;
  selectedSeeker: string;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [recFilter, setRecFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "company">("score");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [runningMatching, setRunningMatching] = useState(false);

  const scoredJobsCount = useMemo(() => {
    const jobIds = new Set<string>();
    matchScores.forEach((m) => {
      if (!m.job_posts?.id) return;
      if (selectedSeeker !== "all" && m.job_seeker_id !== selectedSeeker) return;
      jobIds.add(m.job_posts.id);
    });
    return jobIds.size;
  }, [matchScores, selectedSeeker]);

  const filtered = useMemo(() => {
    return matchScores
      .filter((m) => {
        if (!m.job_posts) return false;
        if (selectedSeeker !== "all" && m.job_seeker_id !== selectedSeeker) return false;
        const seeker = seekerMap.get(m.job_seeker_id);
        const threshold = seeker?.match_threshold ?? 60;
        if (m.score < threshold) return false;
        const routing = routingMap.get(`${m.job_seeker_id}:${m.job_posts.id}`);
        if (routing?.decision === "OVERRIDDEN_OUT") return false;
        if (m.score < minScore) return false;
        if (recFilter !== "all" && m.recommendation !== recFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const job = m.job_posts;
          if (
            !job.title.toLowerCase().includes(q) &&
            !(job.company || "").toLowerCase().includes(q)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "company") return (a.job_posts?.company || "").localeCompare(b.job_posts?.company || "");
        return b.score - a.score;
      });
  }, [matchScores, selectedSeeker, seekerMap, routingMap, minScore, recFilter, search, sortBy]);

  const queueJob = async (seekerId: string, jobPostId: string, matchId: string) => {
    setLoading((prev) => new Set(prev).add(matchId));
    try {
      const res = await fetch("/api/am/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, job_post_id: jobPostId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to queue job." });
      } else {
        setMsg({ type: "success", text: "Job queued successfully." });
        queuedSet.add(`${seekerId}:${jobPostId}`);
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading((prev) => { const n = new Set(prev); n.delete(matchId); return n; });
    }
  };

  const excludeJob = async (seekerId: string, jobPostId: string) => {
    try {
      const res = await fetch("/api/am/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, job_post_id: jobPostId, decision: "OVERRIDDEN_OUT" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to exclude job." });
      } else {
        setMsg({ type: "success", text: "Job excluded." });
        routingMap.set(`${seekerId}:${jobPostId}`, { job_seeker_id: seekerId, job_post_id: jobPostId, decision: "OVERRIDDEN_OUT", note: null });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    }
  };

  const queueAllSelected = async () => {
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i++) {
      const matchId = ids[i];
      const match = matchScores.find((m) => m.id === matchId);
      if (match?.job_posts) {
        await queueJob(match.job_seeker_id, match.job_posts.id, matchId);
      }
    }
    setSelected(new Set());
  };

  const runMatching = async () => {
    const targetSeekerIds =
      selectedSeeker === "all" ? seekers.map((s) => s.id) : [selectedSeeker];

    if (targetSeekerIds.length === 0) {
      setMsg({ type: "error", text: "No seekers available to run matching." });
      return;
    }

    setRunningMatching(true);
    try {
      const res = await fetch("/api/match/run-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_ids: targetSeekerIds,
          only_unscored: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setMsg({
          type: "error",
          text: data.error || "Failed to run matching.",
        });
        return;
      }

      setMsg({
        type: "success",
        text: `Matching completed. ${data.jobs_scored ?? 0} score pairs updated.`,
      });
      router.refresh();
    } catch {
      setMsg({ type: "error", text: "Network error while running matching." });
    } finally {
      setRunningMatching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            type="text"
            placeholder="Title or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min Score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Recommendation</label>
          <select
            value={recFilter}
            onChange={(e) => setRecFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="strong">Strong</option>
            <option value="good">Good</option>
            <option value="marginal">Marginal</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "score" | "company")}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="score">Score (High to Low)</option>
            <option value="company">Company (A-Z)</option>
          </select>
        </div>
        <button
          onClick={runMatching}
          disabled={runningMatching}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {runningMatching ? "Running..." : "Run Matching Now"}
        </button>
        {selected.size > 0 && (
          <button
            onClick={queueAllSelected}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Queue Selected ({selected.size})
          </button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-700">
          Job Bank: <span className="font-semibold">{availableJobsCount}</span> active jobs.
          {" "}Scored for this view: <span className="font-semibold">{scoredJobsCount}</span>.
        </p>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} matches</p>
      <p className="text-xs text-gray-400">Jobs above threshold with strong/good match are auto-queued when matching runs.</p>

      {/* Job cards */}
      <div className="space-y-3">
        {filtered.map((m) => {
          const job = m.job_posts!;
          const seeker = seekerMap.get(m.job_seeker_id);
          const key = `${m.job_seeker_id}:${job.id}`;
          const isQueued = queuedSet.has(key);
          const isApplied = appliedSet.has(key);
          const routing = routingMap.get(key);

          return (
            <div key={m.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(m.id); else n.delete(m.id);
                      return n;
                    });
                  }}
                  className="mt-1"
                  disabled={isQueued || isApplied}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <ScoreBadge score={m.score} />
                    {m.recommendation && (
                      <span className="text-xs text-gray-500 capitalize">{m.recommendation}</span>
                    )}
                    {routing?.decision === "OVERRIDDEN_IN" && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">Override In</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {job.company || "Unknown Company"}
                    {job.location && ` \u2022 ${job.location}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500">
                      Seeker: {seeker?.full_name || seeker?.email || "Unknown"}
                    </span>
                    {job.salary_min != null && job.salary_max != null && (
                      <span className="text-xs text-gray-500">
                        ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {job.required_skills && job.required_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.required_skills.slice(0, 5).map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">{s}</span>
                      ))}
                      {job.required_skills.length > 5 && (
                        <span className="text-xs text-gray-400">+{job.required_skills.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {isApplied ? (
                    <StatusBadge status="APPLIED" />
                  ) : isQueued ? (
                    <StatusBadge status="QUEUED" />
                  ) : (
                    <>
                      <button
                        onClick={() => queueJob(m.job_seeker_id, job.id, m.id)}
                        disabled={loading.has(m.id)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading.has(m.id) ? "..." : "Queue"}
                      </button>
                      <button
                        onClick={() => excludeJob(m.job_seeker_id, job.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200"
                      >
                        Exclude
                      </button>
                    </>
                  )}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-center text-blue-600 text-xs font-medium hover:text-blue-800"
                  >
                    View Posting
                  </a>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-gray-500 text-sm">No matching jobs found.</p>
            {availableJobsCount > 0 && (
              <p className="text-xs text-gray-400">
                Jobs exist in the Job Bank. Run matching now to score newly discovered jobs for these seekers.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Queue Tab ──────────────────────────────────────────────────────

function QueueTab({
  queueItems,
  runByQueueId,
  setMsg,
  switchTab,
}: {
  queueItems: QueueItem[];
  runByQueueId: Map<string, RunItem>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
  switchTab: (tab: TabId) => void;
}) {
  const router = useRouter();
  const [subFilter, setSubFilter] = useState<string>("all");
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [bulkStarting, setBulkStarting] = useState(false);

  const readyCount = queueItems.filter((q) => q.status === "QUEUED").length;

  const startAllReady = async () => {
    const readyIds = queueItems
      .filter((q) => q.status === "QUEUED")
      .map((q) => q.id);
    if (readyIds.length === 0) return;
    setBulkStarting(true);
    try {
      const res = await fetch("/api/apply/start-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_ids: readyIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Batch start failed." });
      } else {
        setMsg({
          type: "success",
          text: `Started ${data.started}, blocked ${data.blocked}, failed ${data.failed}.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBulkStarting(false);
    }
  };

  const filtered = useMemo(() => {
    return queueItems.filter((q) => {
      if (subFilter === "all") return true;
      if (subFilter === "ready") return q.status === "QUEUED";
      if (subFilter === "running") return ["RUNNING", "RETRYING", "READY"].includes(q.status);
      if (subFilter === "attention") return q.status === "NEEDS_ATTENTION";
      return true;
    });
  }, [queueItems, subFilter]);

  const callApi = async (url: string, method: string, body?: Record<string, unknown>, queueId?: string) => {
    if (queueId) setLoading((prev) => new Set(prev).add(queueId));
    try {
      const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Action failed." });
      } else {
        setMsg({ type: "success", text: "Action completed." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      if (queueId) setLoading((prev) => { const n = new Set(prev); n.delete(queueId); return n; });
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "all", label: "All" },
          { id: "ready", label: "Ready" },
          { id: "running", label: "In Progress" },
          { id: "attention", label: "Needs Attention" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setSubFilter(f.id)}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              subFilter === f.id
                ? f.id === "attention"
                  ? "bg-orange-100 text-orange-800 font-medium"
                  : "bg-blue-100 text-blue-800 font-medium"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {readyCount > 0 && (
        <button
          onClick={startAllReady}
          disabled={bulkStarting}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {bulkStarting ? "Starting..." : `Start All Ready (${readyCount})`}
        </button>
      )}

      <p className="text-sm text-gray-500">{filtered.length} items</p>

      <div className="space-y-3">
        {filtered.map((q) => {
          const job = q.job_posts;
          const run = runByQueueId.get(q.id);
          const isLoading = loading.has(q.id);

          return (
            <div key={q.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{job?.title || "Unknown Job"}</h3>
                    <StatusBadge status={q.status} />
                    {run?.ats_type && (
                      <span className="text-xs text-gray-500">ATS: {run.ats_type}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {job?.company || "Unknown Company"}
                    {job?.location && ` \u2022 ${job.location}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Seeker: {q.job_seekers?.full_name || "Unknown"}
                    {" \u2022 "}
                    Queued: {new Date(q.created_at).toLocaleDateString()}
                  </p>
                  {q.last_error && (
                    <p className="text-sm text-red-600 mt-1 bg-red-50 p-2 rounded">{q.last_error}</p>
                  )}
                  {run?.last_error && q.status !== "QUEUED" && (
                    <p className="text-sm text-red-600 mt-1 bg-red-50 p-2 rounded">{run.last_error}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {q.status === "QUEUED" && (
                    <>
                      <button
                        onClick={() => callApi("/api/apply/start", "POST", { queue_id: q.id }, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => callApi(`/api/am/queue?id=${q.id}&job_seeker_id=${q.job_seeker_id}`, "DELETE", undefined, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => switchTab("resumes")}
                        className="px-3 py-1.5 text-blue-600 text-xs font-medium hover:text-blue-800"
                      >
                        Tailor Resume
                      </button>
                    </>
                  )}
                  {["RUNNING", "RETRYING", "READY"].includes(q.status) && (
                    <button
                      onClick={() => callApi("/api/apply/pause", "POST", { queue_id: q.id }, q.id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-yellow-50 text-yellow-800 text-xs font-medium rounded-lg hover:bg-yellow-100 disabled:opacity-50"
                    >
                      Pause
                    </button>
                  )}
                  {q.status === "NEEDS_ATTENTION" && (
                    <>
                      <button
                        onClick={() => callApi("/api/apply/resume", "POST", { queue_id: q.id }, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => callApi("/api/apply/retry", "POST", { queue_id: q.id }, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => callApi("/api/apply/complete", "POST", { queue_id: q.id }, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100 disabled:opacity-50"
                      >
                        Mark Applied
                      </button>
                      <button
                        onClick={() => callApi("/api/apply/fail", "POST", { queue_id: q.id }, q.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        Mark Failed
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">No queue items.</p>
        )}
      </div>
    </div>
  );
}

// ─── Resumes Tab ────────────────────────────────────────────────────

function ResumesTab({
  queueItems,
  seekerMap,
  tailoredMap,
  setMsg,
}: {
  queueItems: QueueItem[];
  seekerMap: Map<string, SeekerSummary>;
  tailoredMap: Map<string, TailoredResume>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [changesSummary, setChangesSummary] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<StructuredResume | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplateId>("classic");
  const [saving, setSaving] = useState(false);

  const queuedJobs = queueItems.filter((q) => q.job_posts);
  const selectedItem = queuedJobs.find((q) => q.id === selectedId);
  const selectedKey = selectedItem
    ? `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`
    : null;
  const existingTailored = selectedKey ? tailoredMap.get(selectedKey) : null;
  const seeker = selectedItem ? seekerMap.get(selectedItem.job_seeker_id) : null;

  // Active data for preview: edited > existing tailored
  const activeData = editedData ?? existingTailored?.tailored_data ?? null;

  const selectItem = (id: string) => {
    setSelectedId(id);
    setEditMode(false);
    setEditedData(null);
    const item = queuedJobs.find((q) => q.id === id);
    if (item) {
      const key = `${item.job_seeker_id}:${item.job_post_id}`;
      const tailored = tailoredMap.get(key);
      setEditedText(tailored?.tailored_text || "");
      setChangesSummary(tailored?.changes_summary || null);
      const sk = seekerMap.get(item.job_seeker_id);
      setSelectedTemplate(
        tailored?.template_id || sk?.resume_template_id || "classic"
      );
    }
  };

  const updateTemplate = async (templateId: ResumeTemplateId) => {
    setSelectedTemplate(templateId);
    if (!selectedItem) return;
    try {
      await fetch("/api/am/resume-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          template_id: templateId,
        }),
      });
    } catch {
      // Best effort - template is stored locally regardless
    }
  };

  const tailorWithAI = async () => {
    if (!selectedItem) return;
    setTailoring(true);
    try {
      const res = await fetch("/api/am/resume-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Tailoring failed." });
      } else {
        setEditedText(data.tailored_resume.tailored_text);
        setChangesSummary(data.changes_summary);
        setEditedData(null);
        setEditMode(false);
        const key = `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`;
        tailoredMap.set(key, data.tailored_resume);
        if (data.tailored_resume.template_id) {
          setSelectedTemplate(data.tailored_resume.template_id);
        }
        setMsg({ type: "success", text: "Resume tailored successfully." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setTailoring(false);
    }
  };

  const saveEdits = async () => {
    if (!selectedItem || !editedData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/am/resume-tailor/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
          tailored_data: editedData,
          template_id: selectedTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Save failed." });
      } else {
        const key = `${selectedItem.job_seeker_id}:${selectedItem.job_post_id}`;
        tailoredMap.set(key, data.tailored_resume);
        setEditedData(null);
        setEditMode(false);
        setMsg({ type: "success", text: "Resume saved." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!selectedItem) return;
    try {
      const res = await fetch("/api/am/resume-tailor/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: selectedItem.job_seeker_id,
          job_post_id: selectedItem.job_post_id,
          template_id: selectedTemplate,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "PDF download failed." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored_resume.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ type: "error", text: "Network error." });
    }
  };

  const revertResume = () => {
    setEditedText("");
    setChangesSummary(null);
    setEditedData(null);
    setEditMode(false);
    if (selectedKey) {
      tailoredMap.delete(selectedKey);
    }
    setMsg({ type: "success", text: "Reverted to default resume." });
  };

  const toggleEditMode = () => {
    if (!editMode && activeData) {
      setEditedData(JSON.parse(JSON.stringify(activeData)));
    }
    setEditMode(!editMode);
  };

  return (
    <div className="flex gap-6 min-h-[500px]">
      {/* Left panel - job list */}
      <div className="w-80 shrink-0 border-r pr-4 overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-3">Queued Jobs</h3>
        <div className="space-y-2">
          {queuedJobs.map((q) => {
            const key = `${q.job_seeker_id}:${q.job_post_id}`;
            const hasTailored = tailoredMap.has(key);
            const hasStructured = !!tailoredMap.get(key)?.tailored_data;
            return (
              <button
                key={q.id}
                onClick={() => selectItem(q.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === q.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-medium text-sm text-gray-900 truncate">{q.job_posts?.title}</p>
                <p className="text-xs text-gray-500 truncate">{q.job_posts?.company}</p>
                <p className="text-xs text-gray-500">{q.job_seekers?.full_name}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                  hasStructured ? "bg-green-100 text-green-800" : hasTailored ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"
                }`}>
                  {hasStructured ? "Tailored" : hasTailored ? "Text Only" : "Default"}
                </span>
              </button>
            );
          })}
          {queuedJobs.length === 0 && (
            <p className="text-gray-500 text-sm">No queued jobs.</p>
          )}
        </div>
      </div>

      {/* Right panel - resume view */}
      <div className="flex-1 min-w-0">
        {!selectedItem ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a job to view/tailor the resume
          </div>
        ) : (
          <div className="space-y-4">
            {/* Template Selector */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">Resume Template</h4>
              <div className="flex gap-2 flex-wrap">
                {RESUME_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateTemplate(t.id)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      selectedTemplate === t.id
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedItem.job_posts?.title} at {selectedItem.job_posts?.company}
                </h3>
                <p className="text-sm text-gray-500">
                  Seeker: {seeker?.full_name || seeker?.email}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={tailorWithAI}
                  disabled={tailoring}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {tailoring ? "Tailoring..." : "Tailor with AI"}
                </button>
                {activeData && (
                  <>
                    <button
                      onClick={downloadPdf}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                    >
                      Download PDF
                    </button>
                    <button
                      onClick={toggleEditMode}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                    >
                      {editMode ? "Cancel Edit" : "Edit"}
                    </button>
                  </>
                )}
                {editMode && editedData && (
                  <button
                    onClick={saveEdits}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
                {(editedText || activeData) && (
                  <button
                    onClick={revertResume}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>

            {/* Job description summary */}
            {selectedItem.job_posts?.description_text && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Job Description</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
                  {selectedItem.job_posts.description_text}
                </p>
                {selectedItem.job_posts.required_skills && selectedItem.job_posts.required_skills.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500">Required:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedItem.job_posts.required_skills.map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedItem.job_posts.preferred_skills && selectedItem.job_posts.preferred_skills.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500">Preferred:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedItem.job_posts.preferred_skills.map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Changes summary */}
            {changesSummary && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-indigo-700 mb-1">AI Changes Summary</h4>
                <p className="text-sm text-indigo-600 whitespace-pre-wrap">{changesSummary}</p>
              </div>
            )}

            {/* Structured resume preview or legacy textarea */}
            {activeData ? (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Tailored Resume Preview
                </h4>
                <ResumePreview
                  data={editMode && editedData ? editedData : activeData}
                  templateId={selectedTemplate}
                  editMode={editMode}
                  onDataChange={setEditedData}
                />
              </div>
            ) : (
              <>
                {/* Original resume */}
                {seeker?.resume_text && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Original Resume</h4>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{seeker.resume_text}</pre>
                    </div>
                  </div>
                )}

                {/* Fallback textarea for legacy text-only tailored resumes */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    {existingTailored || editedText ? "Tailored Resume" : "Custom Resume (paste or use AI)"}
                  </h4>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    placeholder="Use 'Tailor with AI' or paste a custom resume here..."
                    className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg text-sm font-sans resize-y"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Applied Tab ────────────────────────────────────────────────────

function AppliedTab({
  runs,
  seekerMap,
  setMsg,
  switchTab,
}: {
  runs: RunItem[];
  seekerMap: Map<string, SeekerSummary>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
  switchTab: (tab: TabId) => void;
}) {
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const appliedRuns = runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status));

  // Group by company
  const byCompany = useMemo(() => {
    const groups = new Map<string, RunItem[]>();
    appliedRuns.forEach((r) => {
      const company = r.job_posts?.company || "Unknown Company";
      if (!groups.has(company)) groups.set(company, []);
      groups.get(company)!.push(r);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appliedRuns]);

  const findContacts = async (run: RunItem) => {
    if (!run.job_posts) return;
    setLoading((prev) => new Set(prev).add(run.id));
    try {
      const res = await fetch("/api/outreach/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: run.job_seeker_id,
          job_post_id: run.job_post_id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to generate contacts." });
      } else {
        setMsg({ type: "success", text: "Contacts generated. Check Follow Up tab." });
        switchTab("followup");
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading((prev) => { const n = new Set(prev); n.delete(run.id); return n; });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>Total applied: {appliedRuns.length}</span>
        <span>Companies: {byCompany.length}</span>
      </div>

      {byCompany.map(([company, companyRuns]) => (
        <div key={company} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">{company}</h3>
            <p className="text-xs text-gray-500">{companyRuns.length} application(s)</p>
          </div>
          <div className="divide-y">
            {companyRuns.map((r) => {
              const seeker = seekerMap.get(r.job_seeker_id);
              return (
                <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{r.job_posts?.title || "Unknown Job"}</p>
                    <p className="text-sm text-gray-500">
                      {seeker?.full_name || "Unknown Seeker"}
                      {" \u2022 "}
                      {new Date(r.updated_at).toLocaleDateString()}
                      {r.ats_type && ` \u2022 ${r.ats_type}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href="/dashboard/interview-prep"
                      className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-100"
                    >
                      Interview Prep
                    </a>
                    <button
                      onClick={() => findContacts(r)}
                      disabled={loading.has(r.id)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 disabled:opacity-50"
                    >
                      {loading.has(r.id) ? "..." : "Find Contacts"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {byCompany.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">No applied applications yet.</p>
      )}
    </div>
  );
}

// ─── Follow Up Tab ──────────────────────────────────────────────────

function FollowUpTab({
  runs,
  outreachContacts,
  outreachDrafts,
  seekerMap,
  setMsg,
}: {
  runs: RunItem[];
  outreachContacts: OutreachContact[];
  outreachDrafts: OutreachDraft[];
  seekerMap: Map<string, SeekerSummary>;
  setMsg: (m: { type: "success" | "error"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const pendingDrafts = outreachDrafts.filter(
    (d) => d.status === "draft" || d.status === "DRAFT"
  );

  const sendAllDrafts = async () => {
    const draftIds = pendingDrafts.map((d) => d.id);
    if (draftIds.length === 0) return;
    setBulkSending(true);
    try {
      const res = await fetch("/api/outreach/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_ids: draftIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Batch send failed." });
      } else {
        setMsg({
          type: "success",
          text: `Sent ${data.sent}, skipped ${data.skipped}, failed ${data.failed}.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBulkSending(false);
    }
  };

  const appliedRuns = runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status));

  // Group by company
  const companies = useMemo(() => {
    const companyMap = new Map<string, {
      runs: RunItem[];
      contacts: OutreachContact[];
      drafts: OutreachDraft[];
    }>();

    appliedRuns.forEach((r) => {
      const company = r.job_posts?.company || "Unknown";
      if (!companyMap.has(company)) {
        companyMap.set(company, { runs: [], contacts: [], drafts: [] });
      }
      companyMap.get(company)!.runs.push(r);
    });

    outreachContacts.forEach((c) => {
      // Find company from related runs
      const matchedRun = appliedRuns.find(
        (r) => r.job_post_id === c.job_post_id && r.job_seeker_id === c.job_seeker_id
      );
      const company = matchedRun?.job_posts?.company || "Unknown";
      if (companyMap.has(company)) {
        companyMap.get(company)!.contacts.push(c);
      }
    });

    outreachDrafts.forEach((d) => {
      const company = d.job_posts?.company || "Unknown";
      if (companyMap.has(company)) {
        companyMap.get(company)!.drafts.push(d);
      }
    });

    return Array.from(companyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appliedRuns, outreachContacts, outreachDrafts]);

  const selectedData = companies.find(([name]) => name === selectedCompany)?.[1];

  const getOutreachStatus = (data: { contacts: OutreachContact[]; drafts: OutreachDraft[] }) => {
    if (data.drafts.some((d) => d.status === "sent")) return "sent";
    if (data.drafts.length > 0) return "drafts";
    if (data.contacts.length > 0) return "contacts";
    return "none";
  };

  const generateContacts = async () => {
    if (!selectedData) return;
    const run = selectedData.runs[0];
    if (!run) return;
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: run.job_seeker_id,
          job_post_id: run.job_post_id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to generate contacts." });
      } else {
        setMsg({ type: "success", text: "Contacts and drafts generated." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading(false);
    }
  };

  const startEditDraft = (draft: OutreachDraft) => {
    setEditingDraft(draft.id);
    setDraftSubject(draft.subject || "");
    setDraftBody(draft.body || "");
  };

  const sendDraft = async (draftId: string) => {
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draftId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to send." });
      } else {
        setMsg({ type: "success", text: "Email sent." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error." });
    }
  };

  return (
    <div className="space-y-4">
      {pendingDrafts.length > 0 && (
        <button
          onClick={sendAllDrafts}
          disabled={bulkSending}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {bulkSending ? "Sending..." : `Send All Drafts (${pendingDrafts.length})`}
        </button>
      )}
    <div className="flex gap-6 min-h-[500px]">
      {/* Left panel - company list */}
      <div className="w-72 shrink-0 border-r pr-4 overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-3">Companies</h3>
        <div className="space-y-2">
          {companies.map(([name, data]) => {
            const status = getOutreachStatus(data);
            const statusColors: Record<string, string> = {
              sent: "bg-green-100 text-green-800",
              drafts: "bg-yellow-100 text-yellow-800",
              contacts: "bg-blue-100 text-blue-800",
              none: "bg-gray-100 text-gray-600",
            };
            return (
              <button
                key={name}
                onClick={() => setSelectedCompany(name)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedCompany === name
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-medium text-sm text-gray-900 truncate">{name}</p>
                <p className="text-xs text-gray-500">{data.runs.length} application(s)</p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${statusColors[status]}`}>
                  {status === "none" ? "No outreach" : status === "drafts" ? "Drafts pending" : status === "contacts" ? "Contacts found" : "Sent"}
                </span>
              </button>
            );
          })}
          {companies.length === 0 && (
            <p className="text-gray-500 text-sm">No applied companies.</p>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {!selectedCompany || !selectedData ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a company to manage outreach
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-lg">{selectedCompany}</h3>
              <button
                onClick={generateContacts}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Contacts"}
              </button>
            </div>

            {/* Jobs applied */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Jobs Applied</h4>
              <div className="space-y-2">
                {selectedData.runs.map((r) => {
                  const seeker = seekerMap.get(r.job_seeker_id);
                  return (
                    <div key={r.id} className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-sm text-gray-900">{r.job_posts?.title}</p>
                      <p className="text-xs text-gray-500">
                        {seeker?.full_name} \u2022 {new Date(r.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contacts */}
            {selectedData.contacts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Contacts</h4>
                <div className="space-y-2">
                  {selectedData.contacts.map((c) => (
                    <div key={c.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.full_name || c.role || "Contact"}</p>
                        <p className="text-xs text-gray-500">{c.email}</p>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">{c.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drafts */}
            {selectedData.drafts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Email Drafts</h4>
                <div className="space-y-3">
                  {selectedData.drafts.map((d) => (
                    <div key={d.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={d.status.toUpperCase()} />
                          {d.outreach_contacts && (
                            <span className="text-xs text-gray-500">
                              To: {d.outreach_contacts.full_name || d.outreach_contacts.email}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {d.status !== "sent" && (
                            <>
                              <button
                                onClick={() => startEditDraft(d)}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => sendDraft(d.id)}
                                className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                              >
                                Send
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {editingDraft === d.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={draftSubject}
                            onChange={(e) => setDraftSubject(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="Subject"
                          />
                          <textarea
                            value={draftBody}
                            onChange={(e) => setDraftBody(e.target.value)}
                            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingDraft(null)}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-sm text-gray-900">{d.subject}</p>
                          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{d.body}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedData.contacts.length === 0 && selectedData.drafts.length === 0 && (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-500 text-sm">No contacts or drafts yet.</p>
                <p className="text-gray-400 text-xs mt-1">Click &quot;Generate Contacts&quot; to create outreach drafts.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────

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
    DRAFT: "bg-gray-100 text-gray-800",
    SENT: "bg-green-100 text-green-800",
    PENDING: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-800"
      : score >= 60
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${color}`}>
      {score}
    </span>
  );
}
