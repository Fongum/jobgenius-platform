import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

const TAB_VALUES = [
  "recommended",
  "below",
  "overridden_in",
  "overridden_out",
] as const;

type TabValue = (typeof TAB_VALUES)[number];

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const jobSeekerId = context.params.id;
  const amEmail = getAmEmailFromHeaders(request.headers);
  if (!amEmail) {
    return Response.json(
      { success: false, error: "Missing AM email." },
      { status: 400 }
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return Response.json(
      { success: false, error: "Account manager not found." },
      { status: 404 }
    );
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", accountManager.id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }
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
      "job_post_id, score, job_posts (title, company, location, created_at)"
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
    .select("id, job_post_id, status, last_error")
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

  const rows = (scores ?? []).map((scoreRow) => {
    const post = Array.isArray(scoreRow.job_posts)
      ? scoreRow.job_posts[0]
      : scoreRow.job_posts;

    const queueItem = queueMap.get(scoreRow.job_post_id);

    return {
      job_post_id: scoreRow.job_post_id,
      score: scoreRow.score,
      title: post?.title ?? "Untitled",
      company: post?.company ?? null,
      location: post?.location ?? null,
      created_at: post?.created_at ?? null,
      decision: decisionMap.get(scoreRow.job_post_id) ?? null,
      queue_id: queueItem?.id ?? null,
      queue_status: queueItem?.status ?? null,
      last_error: queueItem?.last_error ?? null,
    };
  });

  const filtered = rows.filter((row) => {
    if (tab === "recommended") {
      return row.score >= 60 && row.decision !== "OVERRIDDEN_OUT";
    }
    if (tab === "below") {
      return row.score < 60 && row.decision !== "OVERRIDDEN_IN";
    }
    if (tab === "overridden_in") {
      return row.decision === "OVERRIDDEN_IN";
    }
    return row.decision === "OVERRIDDEN_OUT";
  });

  return Response.json({ success: true, items: filtered });
}
