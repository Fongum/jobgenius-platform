import { requireAMAccessToSeeker } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseServer } from "@/lib/supabase/server";

type PausePayload = {
  run_id?: string;
  claim_token?: string;
  reason?: string;
  error_code?: string;
  message?: string;
  last_seen_url?: string;
  step?: string;
  dom_hint?: string;
  meta?: Record<string, unknown>;
};

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

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
    .select("id, queue_id, current_step, job_seeker_id, ats_type, claim_token")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
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
  const reason = payload.reason ?? payload.error_code ?? "UNKNOWN";

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "NEEDS_ATTENTION",
    message: payload.message ?? "Needs attention.",
    meta: { reason, ...(payload.meta ?? {}) },
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
      locked_at: null,
      locked_by: null,
      claim_token: null,
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
      ...(payload.meta ?? {}),
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
