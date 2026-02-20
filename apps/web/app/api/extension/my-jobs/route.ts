import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

type JobPostRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  source: string | null;
  source_type: string | null;
  created_at: string;
};

type QueueRow = {
  id: string;
  job_post_id: string;
  status: string;
  category: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string | null;
  job_posts: JobPostRow | JobPostRow[] | null;
};

type RunRow = {
  id: string;
  queue_id: string | null;
  status: string;
  current_step: string | null;
  last_error: string | null;
  last_error_code: string | null;
  needs_attention_reason: string | null;
  updated_at: string | null;
};

type MatchScoreRow = {
  job_post_id: string;
  score: number | null;
  confidence: string | null;
  recommendation: string | null;
};

function resolveSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toEpoch(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function putIfNewer<T extends { updated_at: string | null }>(
  map: Map<string, T>,
  key: string,
  row: T
) {
  const existing = map.get(key);
  if (!existing || toEpoch(row.updated_at) >= toEpoch(existing.updated_at)) {
    map.set(key, row);
  }
}

/**
 * GET /api/extension/my-jobs
 *
 * Lists the active seeker's queue/runs so extension users can:
 * - open job links
 * - resume needs-attention runs
 * - mark jobs applied after manual submission
 */
export async function GET(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    if (!session.active_job_seeker_id) {
      return NextResponse.json(
        { success: false, error: "No active job seeker selected." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const includeApplied = searchParams.get("include_applied") === "true";

    let queueQuery = supabaseAdmin
      .from("application_queue")
      .select(
        `
          id,
          job_post_id,
          status,
          category,
          last_error,
          created_at,
          updated_at,
          job_posts!inner (
            id,
            title,
            company,
            location,
            url,
            source,
            source_type,
            created_at
          )
        `
      )
      .eq("job_seeker_id", session.active_job_seeker_id)
      .order("updated_at", { ascending: false })
      .limit(300);

    if (statusFilter) {
      queueQuery = queueQuery.eq("status", statusFilter);
    }

    const { data: queueRows, error: queueError } = await queueQuery;

    if (queueError) {
      console.error("Extension my-jobs queue error:", queueError);
      return NextResponse.json(
        { success: false, error: "Failed to load queue jobs." },
        { status: 500 }
      );
    }

    const queues = ((queueRows ?? []) as QueueRow[]).filter((row) => {
      if (statusFilter) {
        return true;
      }
      if (includeApplied) {
        return true;
      }
      return !["APPLIED", "COMPLETED"].includes(row.status);
    });
    if (queues.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
        counts: {},
        total: 0,
      });
    }

    const queueIds = queues.map((row) => row.id);
    const jobPostIds = queues.map((row) => row.job_post_id);

    const [{ data: runRows, error: runError }, { data: matchRows }] =
      await Promise.all([
        supabaseAdmin
          .from("application_runs")
          .select(
            "id, queue_id, status, current_step, last_error, last_error_code, needs_attention_reason, updated_at"
          )
          .in("queue_id", queueIds),
        supabaseAdmin
          .from("job_match_scores")
          .select("job_post_id, score, confidence, recommendation")
          .eq("job_seeker_id", session.active_job_seeker_id)
          .in("job_post_id", jobPostIds),
      ]);

    if (runError) {
      console.error("Extension my-jobs runs error:", runError);
      return NextResponse.json(
        { success: false, error: "Failed to load application runs." },
        { status: 500 }
      );
    }

    const runByQueueId = new Map<string, RunRow>();
    for (const row of (runRows ?? []) as RunRow[]) {
      if (!row.queue_id) {
        continue;
      }
      putIfNewer(runByQueueId, row.queue_id, row);
    }

    const matchByJobPostId = new Map(
      ((matchRows ?? []) as MatchScoreRow[]).map((row) => [row.job_post_id, row])
    );

    const items = queues
      .map((queue) => {
        const job = resolveSingle(queue.job_posts);
        if (!job?.id) {
          return null;
        }
        const run = runByQueueId.get(queue.id) ?? null;
        const match = matchByJobPostId.get(queue.job_post_id);
        const effectiveStatus = run?.status ?? queue.status;
        const effectiveUpdatedAt = run?.updated_at ?? queue.updated_at ?? queue.created_at;

        return {
          queue_id: queue.id,
          queue_status: queue.status,
          queue_category: queue.category,
          run_id: run?.id ?? null,
          run_status: run?.status ?? null,
          current_step: run?.current_step ?? null,
          needs_attention: effectiveStatus === "NEEDS_ATTENTION",
          needs_attention_reason: run?.needs_attention_reason ?? null,
          last_error:
            run?.last_error ??
            queue.last_error ??
            null,
          last_error_code: run?.last_error_code ?? null,
          updated_at: effectiveUpdatedAt,
          created_at: queue.created_at,
          score: match?.score ?? null,
          confidence: match?.confidence ?? null,
          recommendation: match?.recommendation ?? null,
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            source: job.source,
            source_type: job.source_type,
            created_at: job.created_at,
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (a.needs_attention !== b.needs_attention) {
          return a.needs_attention ? -1 : 1;
        }
        return toEpoch(b.updated_at) - toEpoch(a.updated_at);
      });

    const counts = items.reduce<Record<string, number>>((acc, item) => {
      const status = item.run_status ?? item.queue_status ?? "UNKNOWN";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      items,
      counts,
      total: items.length,
      needs_attention_total: items.filter((item) => item.needs_attention).length,
    });
  } catch (error) {
    console.error("Extension my-jobs error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
