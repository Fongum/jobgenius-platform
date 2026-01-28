import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type RetryPayload = {
  run_id?: string;
  note?: string;
};

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
    .select("id, queue_id, ats_type, current_step, job_seeker_id, attempt_count, max_retries")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Application run not found." },
      { status: 404 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    run.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const nowIso = new Date().toISOString();
  const nextAttempt = (run.attempt_count ?? 0) + 1;
  if (nextAttempt > (run.max_retries ?? 2)) {
    return Response.json(
      { success: false, error: "Max retries exceeded." },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: "RETRYING",
      step_attempts: 0,
      last_error: null,
      last_error_code: null,
      attempt_count: nextAttempt,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to retry run." },
      { status: 500 }
    );
  }

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "RETRY",
    message: payload.note ?? "Retry requested by AM.",
  });

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "RETRY",
    payload: { note: payload.note ?? null },
  });

  if (run.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({ status: "READY", category: "in_progress", updated_at: nowIso })
      .eq("id", run.queue_id);
  }

  return Response.json({
    success: true,
    run_id: run.id,
    status: "RETRYING",
    ats_type: run.ats_type,
    current_step: run.current_step,
  });
}
