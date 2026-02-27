import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { detectAtsType } from "@/lib/apply";

const AUTO_APPLY_ALLOWED_ATS = new Set(
  (process.env.AUTO_APPLY_ALLOWED_ATS ?? "LINKEDIN,GREENHOUSE,WORKDAY,GENERIC")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);
const SWEEP_LIMIT = Math.min(
  Number(process.env.QUEUE_SWEEP_LIMIT ?? 50),
  200
);
// Items must be at least this old before the sweep considers them orphaned.
const SWEEP_MIN_AGE_MINUTES = Math.max(
  Number(process.env.QUEUE_SWEEP_MIN_AGE_MINUTES ?? 5),
  1
);

async function runSweep(request: Request) {
  const auth = requireOpsAuth(request.headers);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const cutoffIso = new Date(
    Date.now() - SWEEP_MIN_AGE_MINUTES * 60 * 1000
  ).toISOString();

  // 1. Find QUEUED items that are old enough to be considered orphaned.
  const { data: queuedItems, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_seeker_id, job_post_id")
    .eq("status", "QUEUED")
    .lte("updated_at", cutoffIso)
    .order("updated_at", { ascending: true })
    .limit(SWEEP_LIMIT);

  if (queueError) {
    return Response.json(
      { success: false, error: "Failed to load queued items." },
      { status: 500 }
    );
  }

  if (!queuedItems || queuedItems.length === 0) {
    return Response.json({ success: true, enqueued: 0, skipped: 0 });
  }

  const queueIds = queuedItems.map((q) => q.id);

  // 2. Find which of these already have an application_run (any status).
  const { data: existingRuns } = await supabaseServer
    .from("application_runs")
    .select("queue_id")
    .in("queue_id", queueIds);

  const runCoveredIds = new Set(
    (existingRuns ?? []).map((r) => r.queue_id).filter(Boolean)
  );

  // 3. Find which have a pending background job (QUEUED / RUNNING / RETRY)
  //    of a type that will create a run for them.
  //    We fetch recent pending jobs and match queue_id from their JSONB payload.
  const { data: pendingJobs } = await supabaseServer
    .from("background_jobs")
    .select("id, type, payload, status")
    .in("type", ["AUTO_START_RUN", "TAILOR_RESUME"])
    .in("status", ["QUEUED", "RUNNING", "RETRY"])
    .limit(500);

  const jobCoveredIds = new Set<string>();
  for (const job of pendingJobs ?? []) {
    const payload = job.payload as Record<string, unknown> | null;
    const qid = typeof payload?.queue_id === "string" ? payload.queue_id : null;
    if (qid) {
      jobCoveredIds.add(qid);
    }
  }

  // 4. Items that need a new AUTO_START_RUN job enqueued.
  const orphans = queuedItems.filter(
    (q) => !runCoveredIds.has(q.id) && !jobCoveredIds.has(q.id)
  );

  if (orphans.length === 0) {
    return Response.json({
      success: true,
      enqueued: 0,
      skipped: queuedItems.length,
    });
  }

  // 5. Resolve ATS types so we can filter for allowed platforms.
  const jobPostIds = [...new Set(orphans.map((q) => q.job_post_id))];
  const { data: jobPosts } = await supabaseServer
    .from("job_posts")
    .select("id, source, url")
    .in("id", jobPostIds);

  const jobPostMap = new Map(
    (jobPosts ?? []).map((jp) => [jp.id, jp])
  );

  let enqueued = 0;
  let skipped = 0;

  for (const item of orphans) {
    const jp = jobPostMap.get(item.job_post_id);
    if (!jp) {
      skipped++;
      continue;
    }

    const atsType = detectAtsType(jp.source, jp.url);
    if (!AUTO_APPLY_ALLOWED_ATS.has(atsType)) {
      skipped++;
      continue;
    }

    try {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: item.id,
        job_seeker_id: item.job_seeker_id,
        job_post_id: item.job_post_id,
      });
      enqueued++;
    } catch {
      skipped++;
    }
  }

  return Response.json({
    success: true,
    enqueued,
    skipped,
    candidates: queuedItems.length,
    run_covered: runCoveredIds.size,
    job_covered: jobCoveredIds.size,
  });
}

export async function POST(request: Request) {
  return runSweep(request);
}

export async function GET(request: Request) {
  return runSweep(request);
}
