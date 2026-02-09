import { requireAM } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const TAB_VALUES = [
  "recommended",
  "below",
  "needs_attention",
  "overridden_in",
  "overridden_out",
] as const;

type TabValue = (typeof TAB_VALUES)[number];

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const jobSeekerId = context.params.id;
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", auth.user.id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }
  const { data: jobSeeker, error: jobSeekerError } = await supabaseServer
    .from("job_seekers")
    .select("match_threshold")
    .eq("id", jobSeekerId)
    .single();

  if (jobSeekerError || !jobSeeker) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  const matchThreshold = jobSeeker.match_threshold ?? 60;
  const { searchParams } = new URL(request.url);
  const tab = (searchParams.get("tab") ?? "recommended") as TabValue;

  if (!TAB_VALUES.includes(tab)) {
    return Response.json(
      { success: false, error: "Invalid tab value." },
      { status: 400 }
    );
  }

  const { data: scores, error: scoresError } = await supabaseServer
    .from("job_match_scores")
    .select(
      "job_post_id, score, confidence, recommendation, reasons, job_posts (title, company, location, created_at)"
    )
    .eq("job_seeker_id", jobSeekerId);

  if (scoresError) {
    return Response.json(
      { success: false, error: "Failed to load job match scores." },
      { status: 500 }
    );
  }

  const { data: decisions, error: decisionsError } = await supabaseServer
    .from("job_routing_decisions")
    .select("job_post_id, decision")
    .eq("job_seeker_id", jobSeekerId);

  if (decisionsError) {
    return Response.json(
      { success: false, error: "Failed to load routing decisions." },
      { status: 500 }
    );
  }

  const decisionMap = new Map(
    (decisions ?? []).map((decision) => [
      decision.job_post_id,
      decision.decision,
    ])
  );

  const { data: queueItems, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_post_id, status, category, last_error")
    .eq("job_seeker_id", jobSeekerId);

  if (queueError) {
    return Response.json(
      { success: false, error: "Failed to load application queue." },
      { status: 500 }
    );
  }

  const queueMap = new Map(
    (queueItems ?? []).map((item) => [item.job_post_id, item])
  );

  const queueIds = (queueItems ?? []).map((item) => item.id);
  let runs: Array<{
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
  }> = [];

  if (queueIds.length > 0) {
    const { data: runRows, error: runError } = await supabaseServer
      .from("application_runs")
      .select(
        "id, queue_id, ats_type, status, current_step, step_attempts, total_attempts, max_step_retries, last_error, last_error_code, last_seen_url, needs_attention_reason"
      )
      .in("queue_id", queueIds);

    if (runError) {
      return Response.json(
        { success: false, error: "Failed to load application runs." },
        { status: 500 }
      );
    }

    runs = (runRows ?? []) as typeof runs;
  }

  const runMap = new Map(runs.map((run) => [run.queue_id, run]));

  const rows = (scores ?? []).map((scoreRow) => {
    const post = Array.isArray(scoreRow.job_posts)
      ? scoreRow.job_posts[0]
      : scoreRow.job_posts;

    const queueItem = queueMap.get(scoreRow.job_post_id);
    const run = queueItem ? runMap.get(queueItem.id) : undefined;

    return {
      job_post_id: scoreRow.job_post_id,
      score: scoreRow.score,
      confidence: scoreRow.confidence ?? null,
      recommendation: scoreRow.recommendation ?? null,
      reasons: scoreRow.reasons ?? null,
      title: post?.title ?? "Untitled",
      company: post?.company ?? null,
      location: post?.location ?? null,
      created_at: post?.created_at ?? null,
      decision: decisionMap.get(scoreRow.job_post_id) ?? null,
      queue_id: queueItem?.id ?? null,
      queue_status: queueItem?.status ?? null,
      queue_category: queueItem?.category ?? null,
      last_error: queueItem?.last_error ?? null,
      run_id: run?.id ?? null,
      ats_type: run?.ats_type ?? null,
      run_status: run?.status ?? null,
      current_step: run?.current_step ?? null,
      step_attempts: run?.step_attempts ?? null,
      total_attempts: run?.total_attempts ?? null,
      max_step_retries: run?.max_step_retries ?? null,
      run_last_error: run?.last_error ?? null,
      last_error_code: run?.last_error_code ?? null,
      last_seen_url: run?.last_seen_url ?? null,
      needs_attention_reason: run?.needs_attention_reason ?? null,
    };
  });

  const filtered = rows.filter((row) => {
    if (tab === "recommended") {
      return (
        row.score >= matchThreshold &&
        row.decision !== "OVERRIDDEN_OUT" &&
        row.run_status !== "NEEDS_ATTENTION"
      );
    }
    if (tab === "below") {
      return (
        row.score < matchThreshold &&
        row.decision !== "OVERRIDDEN_IN" &&
        row.run_status !== "NEEDS_ATTENTION"
      );
    }
    if (tab === "needs_attention") {
      return row.run_status === "NEEDS_ATTENTION";
    }
    if (tab === "overridden_in") {
      return row.decision === "OVERRIDDEN_IN";
    }
    return row.decision === "OVERRIDDEN_OUT";
  });

  return Response.json({ success: true, items: filtered });
}
