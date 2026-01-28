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
      }
    | Array<{
        title: string;
        company: string | null;
        location: string | null;
      }>
    | null;
};

type JobSeeker = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type PageProps = {
  params: { id: string };
};

export default async function JobSeekerQueuePage({ params }: PageProps) {
  const jobSeekerId = params.id;

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
    .select("job_post_id, score, job_posts (title, company, location)")
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
    decision: decisionMap.get(scoreRow.job_post_id) ?? null,
  }));

  return (
    <main>
      <h1>Job Seeker Queue</h1>
      <p>
        {jobSeeker.full_name ?? "Job Seeker"}{" "}
        {jobSeeker.email ? `(${jobSeeker.email})` : ""}
      </p>
      <QueueClient jobSeekerId={jobSeeker.id} items={items} />
    </main>
  );
}
