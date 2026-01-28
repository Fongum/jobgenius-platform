import {
  buildExecutionContract,
  getErrorCodeHint,
  getNextStep,
} from "@/lib/apply";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type NextPayload = {
  run_id?: string;
  step?: string;
  success?: boolean;
  error_code?: string;
  error_message?: string;
  last_seen_url?: string;
  meta?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let payload: NextPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id || !payload.step || payload.success === undefined) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: run_id, step, success.",
      },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, ats_type, status, current_step, step_attempts, total_attempts, max_step_retries"
    )
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Application run not found." },
      { status: 404 }
    );
  }

  if (run.current_step !== payload.step) {
    return Response.json(
      {
        success: false,
        error: "Step does not match current step.",
        current_step: run.current_step,
      },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const totalAttempts = (run.total_attempts ?? 0) + 1;

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: payload.success ? "STEP_DONE" : "STEP_FAILED",
    message: payload.success
      ? "Step completed."
      : payload.error_message ?? "Step failed.",
    meta: payload.meta ?? {},
  });

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: payload.success ? "INFO" : "WARN",
    event_type: payload.success ? "STEP_DONE" : "STEP_FAILED",
    payload: {
      step: run.current_step,
      error_code: payload.error_code ?? null,
      message: payload.error_message ?? null,
      meta: payload.meta ?? {},
    },
  });

  if (!payload.success) {
    const stepAttempts = (run.step_attempts ?? 0) + 1;
    const shouldEscalate = stepAttempts > (run.max_step_retries ?? 2);

    if (shouldEscalate) {
      const errorCode = getErrorCodeHint(payload.error_code);

      await supabaseServer
        .from("application_runs")
        .update({
          status: "NEEDS_ATTENTION",
          needs_attention_reason: errorCode,
          step_attempts: stepAttempts,
          total_attempts: totalAttempts,
          last_error: payload.error_message ?? "Step failed.",
          last_error_code: errorCode,
          last_seen_url: payload.last_seen_url ?? null,
          updated_at: nowIso,
        })
        .eq("id", run.id);

      if (run.queue_id) {
        await supabaseServer
          .from("application_queue")
          .update({
            status: "NEEDS_ATTENTION",
            last_error: payload.error_message ?? "Step failed.",
            updated_at: nowIso,
          })
          .eq("id", run.queue_id);
      }

      await supabaseServer.from("application_step_events").insert({
        run_id: run.id,
        step: run.current_step,
        event_type: "NEEDS_ATTENTION",
        message: payload.error_message ?? "Step requires attention.",
        meta: { error_code: errorCode },
      });

      await supabaseServer.from("apply_run_events").insert({
        run_id: run.id,
        level: "WARN",
        event_type: "NEEDS_ATTENTION",
        payload: {
          step: run.current_step,
          error_code: errorCode,
          message: payload.error_message ?? null,
        },
      });

      await supabaseServer.from("attention_items").insert({
        queue_id: run.queue_id,
        status: "OPEN",
        reason: errorCode,
      });

      return Response.json({
        success: true,
        status: "NEEDS_ATTENTION",
        reason: errorCode,
        next_action_hint: "Resolve manually and resume.",
      });
    }

    await supabaseServer
      .from("application_runs")
      .update({
        status: "RUNNING",
        step_attempts: stepAttempts,
        total_attempts: totalAttempts,
        last_error: payload.error_message ?? "Step failed.",
        last_error_code: payload.error_code ?? null,
        last_seen_url: payload.last_seen_url ?? null,
        updated_at: nowIso,
      })
      .eq("id", run.id);

    const contract = buildExecutionContract({
      runId: run.id,
      status: "RUNNING",
      atsType: run.ats_type,
      currentStep: run.current_step,
    });

    return Response.json({ success: true, ...contract });
  }

  const nextStep = getNextStep(run.ats_type, run.current_step);

  if (!nextStep) {
    await supabaseServer
      .from("application_runs")
      .update({
        status: "COMPLETED",
        step_attempts: 0,
        total_attempts: totalAttempts,
        last_error: null,
        last_error_code: null,
        last_seen_url: payload.last_seen_url ?? null,
        updated_at: nowIso,
      })
      .eq("id", run.id);

    if (run.queue_id) {
      await supabaseServer
        .from("application_queue")
        .update({ status: "COMPLETED", updated_at: nowIso })
        .eq("id", run.queue_id);
    }

    await supabaseServer.from("application_step_events").insert({
      run_id: run.id,
      step: run.current_step,
      event_type: "RUN_COMPLETED",
      message: "Run completed.",
    });

    await supabaseServer.from("apply_run_events").insert({
      run_id: run.id,
      level: "INFO",
      event_type: "RUN_COMPLETED",
      payload: { step: run.current_step },
    });

    return Response.json({
      success: true,
      run_id: run.id,
      status: "COMPLETED",
    });
  }

  await supabaseServer
    .from("application_runs")
    .update({
      status: "RUNNING",
      current_step: nextStep,
      step_attempts: 0,
      total_attempts: totalAttempts,
      last_error: null,
      last_error_code: null,
      last_seen_url: payload.last_seen_url ?? null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: nextStep,
    event_type: "STEP_STARTED",
    message: "Next step started.",
  });

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "STEP_STARTED",
    payload: { step: nextStep },
  });

  const contract = buildExecutionContract({
    runId: run.id,
    status: "RUNNING",
    atsType: run.ats_type,
    currentStep: nextStep,
  });

  return Response.json({ success: true, ...contract });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("jobseekerId");

  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing jobseekerId." },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    jobSeekerId
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const { data: runningRuns, error: runningError } = await supabaseServer
    .from("application_runs")
    .select("id")
    .eq("job_seeker_id", jobSeekerId)
    .in("status", ["RUNNING", "RETRYING"]);

  if (runningError) {
    return Response.json(
      { success: false, error: "Failed to check concurrency." },
      { status: 500 }
    );
  }

  if ((runningRuns?.length ?? 0) >= 5) {
    return Response.json({
      success: false,
      blocked: true,
      reason: "MAX_CONCURRENCY",
      limit: 5,
    });
  }

  const { data: queueRow, error: queueError } = await supabaseServer
    .from("application_queue")
    .select(
      "id, job_post_id, status, job_posts (id, url, title, company, source)"
    )
    .eq("job_seeker_id", jobSeekerId)
    .in("status", ["READY", "QUEUED"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queueError) {
    return Response.json(
      { success: false, error: "Failed to load queue." },
      { status: 500 }
    );
  }

  if (!queueRow) {
    return Response.json({ success: true, status: "IDLE" });
  }

  const jobPost = Array.isArray(queueRow.job_posts)
    ? queueRow.job_posts[0]
    : queueRow.job_posts;

  if (!jobPost?.id) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, status, ats_type, current_step")
    .eq("queue_id", queueRow.id)
    .maybeSingle();

  if (runError) {
    return Response.json(
      { success: false, error: "Failed to load run." },
      { status: 500 }
    );
  }

  let runRecord = run;
  const nowIso = new Date().toISOString();
  if (!runRecord) {
    return Response.json(
      { success: false, error: "Run missing. Start from dashboard first." },
      { status: 409 }
    );
  }

  if (runRecord.status !== "RUNNING") {
    await supabaseServer
      .from("application_runs")
      .update({ status: "RUNNING", updated_at: nowIso })
      .eq("id", runRecord.id);
  }

  await supabaseServer
    .from("application_queue")
    .update({ status: "RUNNING", updated_at: nowIso })
    .eq("id", queueRow.id);

  await supabaseServer.from("apply_run_events").insert({
    run_id: runRecord.id,
    level: "INFO",
    event_type: "RUNNING",
    payload: { step: runRecord.current_step },
  });

  return Response.json({
    success: true,
    run_id: runRecord.id,
    status: "RUNNING",
    ats_type: runRecord.ats_type,
    current_step: runRecord.current_step,
    job: {
      id: jobPost.id,
      url: jobPost.url,
      title: jobPost.title,
      company: jobPost.company,
      source: jobPost.source,
    },
  });
}
