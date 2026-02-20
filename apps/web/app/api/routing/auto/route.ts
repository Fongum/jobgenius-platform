import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";

type RoutingPayload = {
  job_seeker_id?: string;
};

const THRESHOLD = 60;

export async function POST(request: Request) {
  let payload: RoutingPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id) {
    return Response.json(
      { success: false, error: "Missing job_seeker_id." },
      { status: 400 }
    );
  }

  // Authorize: OPS key or AM assigned to this seeker.
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const allowed = await hasJobSeekerAccess(
      amResult.accountManager.id,
      payload.job_seeker_id
    );

    if (!allowed) {
      return Response.json(
        { success: false, error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }
  }

  const { data: scores, error: scoresError } = await supabaseServer
    .from("job_match_scores")
    .select("job_post_id, score")
    .eq("job_seeker_id", payload.job_seeker_id);

  if (scoresError) {
    return Response.json(
      { success: false, error: "Failed to load match scores." },
      { status: 500 }
    );
  }

  const { data: decisions, error: decisionsError } = await supabaseServer
    .from("job_routing_decisions")
    .select("job_post_id, decision")
    .eq("job_seeker_id", payload.job_seeker_id);

  if (decisionsError) {
    return Response.json(
      { success: false, error: "Failed to load routing decisions." },
      { status: 500 }
    );
  }

  const decisionMap = new Map(
    (decisions ?? []).map((decision) => [decision.job_post_id, decision.decision])
  );

  const upserts =
    scores?.flatMap((scoreRow) => {
      const existingDecision = decisionMap.get(scoreRow.job_post_id);

      if (scoreRow.score >= THRESHOLD) {
        if (existingDecision === "OVERRIDDEN_OUT") {
          return [];
        }
        return [
          {
            job_post_id: scoreRow.job_post_id,
            job_seeker_id: payload.job_seeker_id,
            threshold: THRESHOLD,
            decision: "ROUTED",
            decided_by: "SYSTEM",
          },
        ];
      }

      if (existingDecision === "OVERRIDDEN_IN") {
        return [];
      }

      return [
        {
          job_post_id: scoreRow.job_post_id,
          job_seeker_id: payload.job_seeker_id,
          threshold: THRESHOLD,
          decision: "NOT_ROUTED",
          decided_by: "SYSTEM",
        },
      ];
    }) ?? [];

  if (upserts.length > 0) {
    const { error: upsertError } = await supabaseServer
      .from("job_routing_decisions")
      .upsert(upserts, { onConflict: "job_post_id,job_seeker_id" });

    if (upsertError) {
      return Response.json(
        { success: false, error: "Failed to save routing decisions." },
        { status: 500 }
      );
    }
  }

  return Response.json({ success: true, routed: upserts.length });
}
