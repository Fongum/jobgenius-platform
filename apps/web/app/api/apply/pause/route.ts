import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseServer } from "@/lib/supabase/server";

type PausePayload = {
  run_id?: string;
  reason?: string;
  error_code?: string;
  message?: string;
  last_seen_url?: string;
  step?: string;
  dom_hint?: string;
};

export async function POST(request: Request) {
  let payload: PausePayload;

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
    .select("id, queue_id, current_step, job_seeker_id, ats_type")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
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
  const reason = payload.reason ?? payload.error_code ?? "UNKNOWN";

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "NEEDS_ATTENTION",
    message: payload.message ?? "Needs attention.",
    meta: { reason },
  });

  if (run.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({
        status: "NEEDS_ATTENTION",
        category: "needs_attention",
        last_error: payload.message ?? "Needs attention.",
        updated_at: nowIso,
      })
      .eq("id", run.queue_id);
  }

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: "NEEDS_ATTENTION",
      needs_attention_reason: reason,
      last_error: payload.message ?? "Needs attention.",
      last_error_code: payload.error_code ?? reason,
      last_seen_url: payload.last_seen_url ?? null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to pause run." },
      { status: 500 }
    );
  }

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "WARN",
    event_type: "NEEDS_ATTENTION",
    actor: getActorFromHeaders(request.headers),
    payload: {
      reason,
      step: payload.step ?? run.current_step,
      message: payload.message ?? null,
      last_seen_url: payload.last_seen_url ?? null,
      dom_hint: payload.dom_hint ?? null,
    },
  });

  let urlHost: string | null = null;
  if (payload.last_seen_url) {
    try {
      urlHost = new URL(payload.last_seen_url).hostname;
    } catch {
      urlHost = null;
    }
  }

  await supabaseServer.from("apply_error_signatures").insert({
    ats_type: run.ats_type ?? null,
    url_host: urlHost,
    step: payload.step ?? run.current_step,
    error_code: payload.error_code ?? reason,
    dom_hint: payload.dom_hint ?? null,
    message: payload.message ?? null,
  });

  return Response.json({ success: true, run_id: run.id, status: "NEEDS_ATTENTION", reason });
}
