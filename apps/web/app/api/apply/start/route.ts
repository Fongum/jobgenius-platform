import {
  buildExecutionContract,
  detectAtsType,
  getInitialStep,
} from "@/lib/apply";
import { supabaseServer } from "@/lib/supabase/server";

type StartPayload = {
  queue_id?: string;
};

const MAX_CONCURRENCY = 5;

export async function POST(request: Request) {
  let payload: StartPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.queue_id) {
    return Response.json(
      { success: false, error: "Missing queue_id." },
      { status: 400 }
    );
  }

  const { data: queueItem, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_seeker_id, job_post_id, status")
    .eq("id", payload.queue_id)
    .single();

  if (queueError || !queueItem) {
    return Response.json(
      { success: false, error: "Queue item not found." },
      { status: 404 }
    );
  }

  const { data: existingRun, error: existingError } = await supabaseServer
    .from("application_runs")
    .select("id, status, ats_type, current_step")
    .eq("queue_id", queueItem.id)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { success: false, error: "Failed to load application run." },
      { status: 500 }
    );
  }

  if (!existingRun) {
    const { data: runningCountRows, error: runningCountError } =
      await supabaseServer
        .from("application_runs")
        .select("id")
        .eq("job_seeker_id", queueItem.job_seeker_id)
        .eq("status", "RUNNING");

    if (runningCountError) {
      return Response.json(
        { success: false, error: "Failed to check concurrency." },
        { status: 500 }
      );
    }

    const runningCount = runningCountRows?.length ?? 0;
    if (runningCount >= MAX_CONCURRENCY) {
      return Response.json({
        success: false,
        blocked: true,
        reason: "MAX_CONCURRENCY",
        limit: MAX_CONCURRENCY,
      });
    }
  }

  if (existingRun) {
    const contract = buildExecutionContract({
      runId: existingRun.id,
      status: existingRun.status,
      atsType: existingRun.ats_type,
      currentStep: existingRun.current_step,
    });

    return Response.json({ success: true, ...contract });
  }

  const { data: jobPost, error: jobPostError } = await supabaseServer
    .from("job_posts")
    .select("id, source, url")
    .eq("id", queueItem.job_post_id)
    .single();

  if (jobPostError || !jobPost) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  const atsType = detectAtsType(jobPost.source, jobPost.url);
  const initialStep = getInitialStep(atsType);
  const nowIso = new Date().toISOString();

  const { data: createdRun, error: createError } = await supabaseServer
    .from("application_runs")
    .insert({
      queue_id: queueItem.id,
      job_seeker_id: queueItem.job_seeker_id,
      job_post_id: queueItem.job_post_id,
      ats_type: atsType,
      status: "RUNNING",
      current_step: initialStep,
      updated_at: nowIso,
    })
    .select("id, status, ats_type, current_step")
    .single();

  if (createError || !createdRun) {
    return Response.json(
      { success: false, error: "Failed to create application run." },
      { status: 500 }
    );
  }

  await supabaseServer
    .from("application_queue")
    .update({ status: "RUNNING", updated_at: nowIso })
    .eq("id", queueItem.id);

  await supabaseServer.from("application_step_events").insert({
    run_id: createdRun.id,
    step: initialStep,
    event_type: "STEP_STARTED",
    message: "Execution started.",
  });

  const contract = buildExecutionContract({
    runId: createdRun.id,
    status: createdRun.status,
    atsType: createdRun.ats_type,
    currentStep: createdRun.current_step,
  });

  return Response.json({ success: true, ...contract });
}
