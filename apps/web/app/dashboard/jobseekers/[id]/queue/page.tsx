import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";
import QueueClient from "./QueueClient";

type MatchRow = {
  job_post_id: string;
  score: number;
  reasons: Record<string, number> | null;
  job_posts:
    | {
        title: string;
        company: string | null;
        location: string | null;
        created_at: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
        location: string | null;
        created_at: string | null;
      }>
    | null;
};

type JobSeeker = {
  id: string;
  full_name: string | null;
  email: string | null;
  match_threshold: number | null;
};

type QueueRow = {
  id: string;
  job_post_id: string;
  status: string;
  category: string | null;
  last_error: string | null;
  created_at: string;
};

type RunRow = {
  id: string;
  queue_id: string;
  ats_type: string;
  status: string;
  current_step: string;
  step_attempts: number;
  total_attempts: number;
  max_step_retries: number;
  last_error: string | null;
  last_error_code: string | null;
  last_seen_url: string | null;
  needs_attention_reason: string | null;
};

type StepEventRow = {
  run_id: string;
  step: string;
  event_type: string;
  message: string | null;
  created_at: string;
};

type PageProps = {
  params: { id: string };
};

export default async function JobSeekerQueuePage({ params }: PageProps) {
  const jobSeekerId = params.id;
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Job Seeker Queue</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return (
      <main>
        <h1>Job Seeker Queue</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", accountManager.id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return (
      <main>
        <h1>Job Seeker Queue</h1>
        <p>Not authorized for this job seeker.</p>
      </main>
    );
  }

  const { data: jobSeeker, error: jobSeekerError } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, email, match_threshold")
    .eq("id", jobSeekerId)
    .single();

  if (jobSeekerError || !jobSeeker) {
    throw new Error("Failed to load job seeker.");
  }

  const { data: scores, error: scoresError } = await supabaseServer
    .from("job_match_scores")
    .select(
      "job_post_id, score, reasons, job_posts (title, company, location, created_at)"
    )
    .eq("job_seeker_id", jobSeekerId);

  if (scoresError) {
    throw new Error("Failed to load job match scores.");
  }

  const { data: decisions, error: decisionsError } = await supabaseServer
    .from("job_routing_decisions")
    .select("job_post_id, decision")
    .eq("job_seeker_id", jobSeekerId);

  if (decisionsError) {
    throw new Error("Failed to load routing decisions.");
  }

  const { data: queueRows, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_post_id, status, category, last_error, created_at")
    .eq("job_seeker_id", jobSeekerId);

  if (queueError) {
    throw new Error("Failed to load application queue.");
  }

  const queueMap = new Map(
    (queueRows ?? []).map((item) => [item.job_post_id, item])
  );

  const queueIds = (queueRows ?? []).map((item) => item.id);
  let runs: RunRow[] = [];
  if (queueIds.length > 0) {
    const { data: runRows, error: runsError } = await supabaseServer
      .from("application_runs")
      .select(
        "id, queue_id, ats_type, status, current_step, step_attempts, total_attempts, max_step_retries, last_error, last_error_code, last_seen_url, needs_attention_reason"
      )
      .in("queue_id", queueIds);

    if (runsError) {
      throw new Error("Failed to load application runs.");
    }

    runs = (runRows ?? []) as RunRow[];
  }

  const runMap = new Map(runs.map((run) => [run.queue_id, run]));

  const runIds = runs.map((run) => run.id);
  let stepEvents: StepEventRow[] = [];
  if (runIds.length > 0) {
    const { data: stepEventRows, error: stepEventError } = await supabaseServer
      .from("application_step_events")
      .select("run_id, step, event_type, message, created_at")
      .in("run_id", runIds)
      .order("created_at", { ascending: false });

    if (stepEventError) {
      throw new Error("Failed to load application step events.");
    }

    stepEvents = (stepEventRows ?? []) as StepEventRow[];
  }

  const eventsByRun = new Map<string, StepEventRow[]>();
  for (const event of stepEvents) {
    const existing = eventsByRun.get(event.run_id) ?? [];
    if (existing.length < 3) {
      existing.push(event);
      eventsByRun.set(event.run_id, existing);
    }
  }

  const decisionMap = new Map(
    (decisions ?? []).map((decision) => [
      decision.job_post_id,
      decision.decision,
    ])
  );

  const rows = (scores ?? []) as MatchRow[];

  const items = rows.map((scoreRow) => ({
    job_post_id: scoreRow.job_post_id,
    score: scoreRow.score,
    reasons: scoreRow.reasons ?? null,
    title:
      (Array.isArray(scoreRow.job_posts)
        ? scoreRow.job_posts[0]?.title
        : scoreRow.job_posts?.title) ?? "Untitled",
    company:
      (Array.isArray(scoreRow.job_posts)
        ? scoreRow.job_posts[0]?.company
        : scoreRow.job_posts?.company) ?? null,
    location:
      (Array.isArray(scoreRow.job_posts)
        ? scoreRow.job_posts[0]?.location
        : scoreRow.job_posts?.location) ?? null,
    created_at:
      (Array.isArray(scoreRow.job_posts)
        ? scoreRow.job_posts[0]?.created_at
        : scoreRow.job_posts?.created_at) ?? null,
    decision: decisionMap.get(scoreRow.job_post_id) ?? null,
    queue_id: queueMap.get(scoreRow.job_post_id)?.id ?? null,
    queue_status: queueMap.get(scoreRow.job_post_id)?.status ?? null,
    queue_category: queueMap.get(scoreRow.job_post_id)?.category ?? null,
    last_error: queueMap.get(scoreRow.job_post_id)?.last_error ?? null,
    run_id: runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.id ?? null,
    ats_type:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.ats_type ?? null,
    run_status:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.status ?? null,
    current_step:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.current_step ??
      null,
    step_attempts:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.step_attempts ??
      null,
    total_attempts:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.total_attempts ??
      null,
    max_step_retries:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")
        ?.max_step_retries ?? null,
    run_last_error:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.last_error ??
      null,
    needs_attention_reason:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")
        ?.needs_attention_reason ?? null,
    last_error_code:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.last_error_code ??
      null,
    last_seen_url:
      runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.last_seen_url ??
      null,
    events:
      eventsByRun.get(
        runMap.get(queueMap.get(scoreRow.job_post_id)?.id ?? "")?.id ?? ""
      ) ?? [],
  }));

  return (
    <main>
      <h1>Job Seeker Queue</h1>
      <p>
        {jobSeeker.full_name ?? "Job Seeker"}{" "}
        {jobSeeker.email ? `(${jobSeeker.email})` : ""}
      </p>
      <p>TODO: Replace AM email header with real auth.</p>
      <QueueClient
        jobSeekerId={jobSeeker.id}
        matchThreshold={jobSeeker.match_threshold ?? 60}
        amEmail={amEmail}
        items={items}
      />
    </main>
  );
}
