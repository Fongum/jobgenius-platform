import { randomUUID } from "crypto";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseAdmin } from "@/lib/auth";
import { resolveJobTargetUrl } from "@/lib/job-url";
import { supabaseServer } from "@/lib/supabase/server";

// ============================================================
// Shared apply-claim logic used by both the modern POST
// /api/apply/tasks/claim and the legacy GET /api/apply/next-global.
// ============================================================

export type ClaimContext = {
  request: Request;
  accountManagerId: string;
  accountManagerEmail: string;
  isRunner: boolean;
  /** Optional runner id from the modern POST body, kept for telemetry. */
  runnerId?: string | null;
};

export type ClaimResult =
  | { kind: "idle" }
  | {
      kind: "blocked";
      reason: string;
      limit?: number;
    }
  | { kind: "error"; status: number; error: string }
  | {
      kind: "claimed";
      payload: Record<string, unknown>;
    };

const MAX_CONCURRENT_RUNS_PER_AM = 5;

/**
 * Per-ATS concurrency cap. Set via MAX_CONCURRENT_PER_ATS env (default 3).
 * Prevents a fleet from hammering a single ATS host with all runners at once,
 * which is the fastest way to trigger captcha/rate-limit cascades.
 *
 * Set to 0 to disable per-ATS capping.
 */
function readMaxConcurrentPerAts(): number {
  const raw = Number(process.env.MAX_CONCURRENT_PER_ATS);
  if (!Number.isFinite(raw) || raw < 0) return 3;
  return Math.floor(raw);
}

async function getAtsAtCapacity(): Promise<Set<string>> {
  const cap = readMaxConcurrentPerAts();
  if (cap <= 0) return new Set();
  const { data } = await supabaseServer
    .from("application_runs")
    .select("ats_type")
    .in("status", ["RUNNING", "RETRYING"]);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const ats = (row.ats_type as string | null) ?? "UNKNOWN";
    counts.set(ats, (counts.get(ats) ?? 0) + 1);
  }
  const blocked = new Set<string>();
  counts.forEach((n, ats) => {
    if (n >= cap) blocked.add(ats);
  });
  return blocked;
}

export async function claimNextRun(ctx: ClaimContext): Promise<ClaimResult> {
  let assignedIds: string[] = [];

  if (!ctx.isRunner) {
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", ctx.accountManagerId);

    if (assignmentsError) {
      return {
        kind: "error",
        status: 500,
        error: "Failed to load job seeker assignments.",
      };
    }

    assignedIds = (assignments ?? []).map((row) => row.job_seeker_id);
    if (assignedIds.length === 0) {
      return { kind: "idle" };
    }

    const { data: runningRuns, error: runningError } = await supabaseServer
      .from("application_runs")
      .select("id")
      .in("job_seeker_id", assignedIds)
      .in("status", ["RUNNING", "RETRYING"]);

    if (runningError) {
      return { kind: "error", status: 500, error: "Failed to check concurrency." };
    }

    if ((runningRuns?.length ?? 0) >= MAX_CONCURRENT_RUNS_PER_AM) {
      return {
        kind: "blocked",
        reason: "MAX_CONCURRENCY",
        limit: MAX_CONCURRENT_RUNS_PER_AM,
      };
    }
  }

  // Identify ATSes currently at the per-ATS concurrency cap so we skip
  // their runs and let other ATSes get worked instead.
  const atsAtCapacity = await getAtsAtCapacity();

  let nextRunQuery = supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, job_post_id, ats_type, status, current_step, attempt_count, max_retries, job_seeker_id, resume_url_used, resume_source, priority"
    )
    .in("status", ["READY", "RETRYING"])
    .is("locked_at", null)
    .order("priority", { ascending: true })   // 1 = highest priority
    .order("updated_at", { ascending: true }) // then oldest within priority
    .limit(1);

  if (!ctx.isRunner) {
    nextRunQuery = nextRunQuery.in("job_seeker_id", assignedIds);
  }
  if (atsAtCapacity.size > 0) {
    // Supabase has no "not in" array shortcut here that works cleanly with
    // empty sets; we build a filter string.
    const blocklist = Array.from(atsAtCapacity)
      .map((a) => `"${a.replace(/"/g, '\\"')}"`)
      .join(",");
    nextRunQuery = nextRunQuery.not("ats_type", "in", `(${blocklist})`);
  }

  const { data: nextRun, error: nextRunError } = await nextRunQuery.maybeSingle();
  if (nextRunError) {
    return { kind: "error", status: 500, error: "Failed to load next run." };
  }
  if (!nextRun) {
    return { kind: "idle" };
  }

  const nowIso = new Date().toISOString();
  const claimToken = randomUUID();
  const actor = getActorFromHeaders(ctx.request.headers);
  const lockedBy = `${actor}:${ctx.accountManagerEmail}`;

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
    .select(
      "id, queue_id, ats_type, current_step, attempt_count, max_retries, job_post_id, job_seeker_id, resume_url_used, resume_source"
    )
    .single();

  // If the conditional update lost the race, treat as idle so the runner
  // simply polls again instead of double-running someone else's task.
  if (lockError || !lockedRun) {
    return { kind: "idle" };
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
    payload: {
      step: lockedRun.current_step,
      runner_id: ctx.runnerId ?? null,
    },
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
        .select("tailored_text, resume_url")
        .eq("job_seeker_id", lockedRun.job_seeker_id)
        .eq("job_post_id", lockedRun.job_post_id)
        .maybeSingle(),
    ]);

  if (!jobPost?.id) {
    return { kind: "error", status: 404, error: "Job post not found." };
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
  const resumeSource = tailoredResumeUrl ? "TAILORED" : resumeUrl ? "BASE" : null;
  const jobUrl = resolveJobTargetUrl(jobPost.url ?? "") || jobPost.url;

  if (resumeUrl && !lockedRun.resume_url_used) {
    await supabaseServer
      .from("application_runs")
      .update({
        resume_url_used: resumeUrl,
        resume_source: resumeSource,
        updated_at: nowIso,
      })
      .eq("id", lockedRun.id)
      .is("resume_url_used", null);
  }

  return {
    kind: "claimed",
    payload: {
      success: true,
      task_id: lockedRun.id,
      run_id: lockedRun.id,
      queue_id: lockedRun.queue_id,
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
        tailored_text: tailoredResume?.tailored_text ?? null,
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
        url: jobUrl,
        source_url: jobPost.url,
        title: jobPost.title,
        company: jobPost.company,
        source: jobPost.source,
      },
    },
  };
}
