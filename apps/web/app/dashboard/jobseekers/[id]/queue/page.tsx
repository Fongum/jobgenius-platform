import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";
import QueueClient from "./QueueClient";

type QueueItem = {
  job_post_id: string;
  score: number;
  job_posts: {
    title: string;
    company: string | null;
    location: string | null;
  } | null;
};

type MatchRow = {
  job_post_id: string;
  score: number;
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
};

type QueueRow = {
  id: string;
  job_post_id: string;
  status: string;
  last_error: string | null;
  created_at: string;
};

type EventRow = {
  queue_id: string;
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
    .select("id, full_name, email")
    .eq("id", jobSeekerId)
    .single();

  if (jobSeekerError || !jobSeeker) {
    throw new Error("Failed to load job seeker.");
  }

  const { data: scores, error: scoresError } = await supabaseServer
    .from("job_match_scores")
    .select("job_post_id, score, job_posts (title, company, location, created_at)")
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
    .select("id, job_post_id, status, last_error, created_at")
    .eq("job_seeker_id", jobSeekerId);

  if (queueError) {
    throw new Error("Failed to load application queue.");
  }

  const queueMap = new Map(
    (queueRows ?? []).map((item) => [item.job_post_id, item])
  );

  const queueIds = (queueRows ?? []).map((item) => item.id);
  let events: EventRow[] = [];
  if (queueIds.length > 0) {
    const { data: eventRows, error: eventsError } = await supabaseServer
      .from("application_events")
      .select("queue_id, event_type, message, created_at")
      .in("queue_id", queueIds)
      .order("created_at", { ascending: false });

    if (eventsError) {
      throw new Error("Failed to load application events.");
    }

    events = (eventRows ?? []) as EventRow[];
  }

  const eventsByQueue = new Map<string, EventRow[]>();
  for (const event of events) {
    const existing = eventsByQueue.get(event.queue_id) ?? [];
    if (existing.length < 3) {
      existing.push(event);
      eventsByQueue.set(event.queue_id, existing);
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
    last_error: queueMap.get(scoreRow.job_post_id)?.last_error ?? null,
    events: eventsByQueue.get(queueMap.get(scoreRow.job_post_id)?.id ?? "") ?? [],
  }));

  return (
    <main>
      <h1>Job Seeker Queue</h1>
      <p>
        {jobSeeker.full_name ?? "Job Seeker"}{" "}
        {jobSeeker.email ? `(${jobSeeker.email})` : ""}
      </p>
      <p>TODO: Replace AM email header with real auth.</p>
      <QueueClient jobSeekerId={jobSeeker.id} items={items} />
    </main>
  );
}
