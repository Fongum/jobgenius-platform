import { getAccountManagerFromRequest, isRunnerAccountManager } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const isRunner = await isRunnerAccountManager(amResult.accountManager.id);

  let assignedIds: string[] = [];
  if (!isRunner) {
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", amResult.accountManager.id);

    if (assignmentsError) {
      return Response.json(
        { success: false, error: "Failed to load job seeker assignments." },
        { status: 500 }
      );
    }

    assignedIds = (assignments ?? []).map((row) => row.job_seeker_id);
    if (assignedIds.length === 0) {
      return Response.json({ success: true, status: "IDLE" });
    }

    const { data: runningRuns, error: runningError } = await supabaseServer
      .from("application_runs")
      .select("id")
      .in("job_seeker_id", assignedIds)
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
  }

  let nextRunQuery = supabaseServer
    .from("application_runs")
    .select("id, queue_id, job_post_id, ats_type, status, current_step, attempt_count, max_retries, job_seeker_id")
    .in("status", ["READY", "RETRYING"])
    .is("locked_at", null)
    .order("updated_at", { ascending: true })
    .limit(1);

  if (!isRunner) {
    nextRunQuery = nextRunQuery.in("job_seeker_id", assignedIds);
  }

  const { data: nextRun, error: nextRunError } = await nextRunQuery.maybeSingle();

  if (nextRunError) {
    return Response.json(
      { success: false, error: "Failed to load next run." },
      { status: 500 }
    );
  }

  if (!nextRun) {
    return Response.json({ success: true, status: "IDLE" });
  }

  const nowIso = new Date().toISOString();
  const claimToken = randomUUID();
  const actor = getActorFromHeaders(request.headers);
  const lockedBy = `${actor}:${amResult.accountManager.email}`;

  const { data: lockedRun, error: lockError } = await supabaseServer
    .from("application_runs")
    .update({
      status: "RUNNING",
      locked_at: nowIso,
      locked_by: lockedBy,
      claim_token: claimToken,
      updated_at: nowIso,
    })
    .eq("id", nextRun.id)
    .is("locked_at", null)
    .in("status", ["READY", "RETRYING"])
    .select("id, queue_id, ats_type, current_step, attempt_count, max_retries, job_post_id, job_seeker_id")
    .single();

  if (lockError || !lockedRun) {
    return Response.json({ success: true, status: "IDLE" });
  }

  if (lockedRun.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({ status: "RUNNING", updated_at: nowIso })
      .eq("id", lockedRun.queue_id);
  }

  await supabaseServer.from("apply_run_events").insert({
    run_id: lockedRun.id,
    level: "INFO",
    event_type: "RUNNING",
    actor,
    payload: { step: lockedRun.current_step },
  });

  const [{ data: jobSeeker }, { data: jobPost }, { data: tailoredResume }] =
    await Promise.all([
    supabaseServer
      .from("job_seekers")
      .select(
        "id, resume_url, full_name, email, phone, location, linkedin_url, portfolio_url, address_line1, address_city, address_state, address_zip, address_country"
      )
      .eq("id", lockedRun.job_seeker_id)
      .maybeSingle(),
    supabaseServer
      .from("job_posts")
      .select("id, url, title, company, source")
      .eq("id", lockedRun.job_post_id)
      .single(),
    supabaseServer
      .from("tailored_resumes")
      .select("resume_url")
      .eq("job_seeker_id", lockedRun.job_seeker_id)
      .eq("job_post_id", lockedRun.job_post_id)
      .maybeSingle(),
  ]);

  if (!jobPost?.id) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  let storageStateUrl: string | null = null;
  try {
    const storagePath = `${lockedRun.job_seeker_id}/storage-state.json`;
    const { data: signedState } = await supabaseAdmin.storage
      .from("runner_state")
      .createSignedUrl(storagePath, 7 * 24 * 60 * 60);
    if (signedState?.signedUrl) {
      storageStateUrl = signedState.signedUrl;
    }
  } catch {
    storageStateUrl = null;
  }

  const tailoredResumeUrl = tailoredResume?.resume_url ?? null;
  const resumeUrl = tailoredResumeUrl ?? jobSeeker?.resume_url ?? null;

  return Response.json({
    success: true,
    run_id: lockedRun.id,
    claim_token: claimToken,
    status: "RUNNING",
    ats_type: lockedRun.ats_type,
    current_step: lockedRun.current_step,
    job_seeker_id: lockedRun.job_seeker_id,
    attempts: {
      attempt_count: lockedRun.attempt_count ?? 0,
      max_retries: lockedRun.max_retries ?? 2,
    },
    resume: {
      url: resumeUrl,
      tailored_url: tailoredResumeUrl,
    },
    storage_state_url: storageStateUrl,
    profile: jobSeeker
      ? {
          full_name: jobSeeker.full_name ?? null,
          email: jobSeeker.email ?? null,
          phone: jobSeeker.phone ?? null,
          location: jobSeeker.location ?? null,
          linkedin_url: jobSeeker.linkedin_url ?? null,
          portfolio_url: jobSeeker.portfolio_url ?? null,
          address_line1: jobSeeker.address_line1 ?? null,
          address_city: jobSeeker.address_city ?? null,
          address_state: jobSeeker.address_state ?? null,
          address_zip: jobSeeker.address_zip ?? null,
          address_country: jobSeeker.address_country ?? null,
        }
      : null,
    job: {
      id: jobPost.id,
      url: jobPost.url,
      title: jobPost.title,
      company: jobPost.company,
      source: jobPost.source,
    },
  });
}
