import { requireAMAccessToSeeker } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseServer } from "@/lib/supabase/server";
import { determineRetryStrategy, recordRetryStrategy } from "@/lib/smart-retry";
import { logActivity } from "@/lib/feedback-loop";

type RetryPayload = {
  run_id?: string;
  claim_token?: string;
  note?: string;
};

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: RetryPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, ats_type, current_step, job_seeker_id, attempt_count, max_retries, claim_token"
    )
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Application run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  if (requiresClaimToken(request.headers)) {
    if (!payload.claim_token) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== payload.claim_token) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const nextAttempt = (run.attempt_count ?? 0) + 1;
  if (nextAttempt > (run.max_retries ?? 2)) {
    return Response.json(
      { success: false, error: "Max retries exceeded." },
      { status: 409 }
    );
  }

  // Determine smart retry strategy based on failure context
  const { data: prevStrategies } = await supabaseServer
    .from("retry_strategies")
    .select("strategy")
    .eq("run_id", run.id);

  const retryResult = determineRetryStrategy({
    errorCode: (run as Record<string, unknown>).last_error_code as string | null,
    lastError: (run as Record<string, unknown>).last_error as string | null,
    failedStep: run.current_step,
    atsType: run.ats_type,
    attemptNumber: nextAttempt,
    previousStrategies: (prevStrategies ?? []).map((s) => s.strategy),
  });

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: "RETRYING",
      step_attempts: 0,
      last_error: null,
      last_error_code: null,
      attempt_count: nextAttempt,
      locked_at: null,
      locked_by: null,
      claim_token: null,
      retry_strategy: retryResult.strategy,
      retry_changes: retryResult.changes,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to retry run." },
      { status: 500 }
    );
  }

  // Record retry strategy for learning
  recordRetryStrategy(run.id, nextAttempt, retryResult.strategy, retryResult.changes).catch((err) => console.error("[apply:retry] retry strategy recording failed:", err));

  const { error: stepError } = await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "RETRY",
    message: `${payload.note ?? "Retry requested."} Strategy: ${retryResult.strategy} — ${retryResult.reason}`,
  });

  if (stepError) {
    console.error("[apply:retry] failed to insert step event:", stepError);
  }

  const { error: runEventError } = await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "RETRY",
    actor: getActorFromHeaders(request.headers),
    payload: {
      note: payload.note ?? null,
      strategy: retryResult.strategy,
      changes: retryResult.changes,
      reason: retryResult.reason,
    },
  });

  if (runEventError) {
    console.error("[apply:retry] failed to insert run event:", runEventError);
  }

  if (run.queue_id) {
    const { error: queueError } = await supabaseServer
      .from("application_queue")
      .update({ status: "READY", category: "in_progress", updated_at: nowIso })
      .eq("id", run.queue_id);

    if (queueError) {
      console.error("[apply:retry] failed to update queue status:", queueError);
    }
  }

  // Log to activity feed (non-blocking)
  logActivity(run.job_seeker_id, {
    eventType: "application_retry",
    title: "Application retrying",
    description: `Strategy: ${retryResult.strategy} — ${retryResult.reason}`,
    meta: { run_id: run.id, attempt: nextAttempt, strategy: retryResult.strategy },
    refType: "application_runs",
    refId: run.id,
  }).catch((err) => console.error("[apply:retry] activity log failed:", err));

  return Response.json({
    success: true,
    run_id: run.id,
    status: "RETRYING",
    ats_type: run.ats_type,
    current_step: run.current_step,
    retry_strategy: retryResult.strategy,
    retry_reason: retryResult.reason,
  });
}
