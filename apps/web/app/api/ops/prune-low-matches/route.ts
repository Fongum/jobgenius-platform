import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { supabaseServer } from "@/lib/supabase/server";
import { READER_MIN_SCORE, getMatchStoreFloor, scoreKey } from "@/lib/match-storage";

// ============================================================
// POST /api/ops/prune-low-matches
//
// Deletes job_match_scores rows below the storage floor (see lib/match-storage.ts).
// Production had 102,475 rows under 40 out of 103,192; no screen reads them.
//
// Safe by design:
//   - dry run unless the body has `"confirm": true`;
//   - the floor is clamped to READER_MIN_SCORE (40), the lowest score any screen
//     reads, so this can never delete a score that would have been displayed;
//   - a pair that has ever had an application_queue item is kept (its score row
//     holds the "why was this matched" explanation an AM may still open);
//   - each delete re-checks `score < floor`, so a row that was rescored upward
//     between the read and the delete is not removed.
//
// Work in batches: call repeatedly until `has_more` is false.
// Body: { confirm?: boolean, limit?: number (1-20000, default 5000), min_score?: number }
// ============================================================

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 20000;
const DELETE_CHUNK = 500;
const PAGE = 1000;

async function loadProtectedPairs(): Promise<{ pairs: Set<string>; error?: string }> {
  const pairs = new Set<string>();
  for (let from = 0; ; ) {
    const { data, error } = await supabaseServer
      .from("application_queue")
      .select("job_post_id, job_seeker_id")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { pairs, error: error.message };
    if (!data || data.length === 0) break;
    for (const row of data) pairs.add(scoreKey(String(row.job_seeker_id), String(row.job_post_id)));
    from += data.length;
  }
  return { pairs };
}

export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  let body: { confirm?: unknown; limit?: unknown; min_score?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine: it means a dry run with defaults.
  }

  const confirm = body.confirm === true;
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const requestedFloor = Number(body.min_score);
  const floor =
    body.min_score === undefined || !Number.isFinite(requestedFloor)
      ? getMatchStoreFloor()
      : Math.min(Math.max(Math.floor(requestedFloor), 0), READER_MIN_SCORE);

  if (floor <= 0) {
    return Response.json({ success: true, dry_run: !confirm, matched: 0, note: "Floor is 0: nothing to prune." });
  }

  const protectedPairs = await loadProtectedPairs();
  if (protectedPairs.error) {
    console.error("[matches:prune] failed to load queue pairs:", protectedPairs.error);
    return Response.json(
      { success: false, error: "Failed to load queue items; nothing was deleted." },
      { status: 500 }
    );
  }

  // score has an index (job_match_scores_score_idx), so this range read is cheap.
  const { data: rows, error: loadError } = await supabaseServer
    .from("job_match_scores")
    .select("id, job_seeker_id, job_post_id")
    .lt("score", floor)
    .order("score", { ascending: true })
    .limit(limit);

  if (loadError) {
    console.error("[matches:prune] failed to load low scores:", loadError);
    return Response.json({ success: false, error: "Failed to load scores." }, { status: 500 });
  }

  const scanned = rows ?? [];
  const deletable = scanned.filter(
    (row) => !protectedPairs.pairs.has(scoreKey(String(row.job_seeker_id), String(row.job_post_id)))
  );
  const keptForQueue = scanned.length - deletable.length;

  if (!confirm) {
    return Response.json({
      success: true,
      dry_run: true,
      floor,
      scanned: scanned.length,
      would_delete: deletable.length,
      kept_for_queue: keptForQueue,
      has_more: scanned.length === limit,
      note: 'Nothing was deleted. Send {"confirm": true} to delete this batch.',
    });
  }

  let deleted = 0;
  let failedChunks = 0;
  const ids = deletable.map((row) => row.id as string);

  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_CHUNK);
    const { data: removed, error: deleteError } = await supabaseServer
      .from("job_match_scores")
      .delete()
      .in("id", chunk)
      .lt("score", floor) // re-check: never delete a row rescored upward since the read
      .select("id");

    if (deleteError) {
      console.error("[matches:prune] delete failed:", deleteError);
      failedChunks++;
      continue;
    }
    deleted += removed?.length ?? 0;
  }

  return Response.json({
    success: failedChunks === 0,
    dry_run: false,
    floor,
    scanned: scanned.length,
    deleted,
    kept_for_queue: keptForQueue,
    failed_chunks: failedChunks,
    // Rows kept for the queue keep matching the filter, so a full page may not shrink;
    // has_more is only meaningful while something was actually deleted.
    has_more: scanned.length === limit && deleted > 0,
  });
}
