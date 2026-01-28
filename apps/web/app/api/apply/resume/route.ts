import { buildExecutionContract } from "@/lib/apply";
import { supabaseServer } from "@/lib/supabase/server";

type ResumePayload = {
  run_id?: string;
  note?: string;
};

export async function POST(request: Request) {
  let payload: ResumePayload;

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
    .select("id, queue_id, ats_type, current_step")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Application run not found." },
      { status: 404 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: "RUNNING",
      step_attempts: 0,
      last_error: null,
      last_error_code: null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to resume run." },
      { status: 500 }
    );
  }

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "RESUMED",
    message: payload.note ?? "Resumed by AM.",
  });

  if (run.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({ status: "RUNNING", updated_at: nowIso })
      .eq("id", run.queue_id);

    await supabaseServer
      .from("attention_items")
      .update({ status: "RESOLVED", resolved_at: nowIso })
      .eq("queue_id", run.queue_id);
  }

  const contract = buildExecutionContract({
    runId: run.id,
    status: "RUNNING",
    atsType: run.ats_type,
    currentStep: run.current_step,
  });

  return Response.json({ success: true, ...contract });
}
