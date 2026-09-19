import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { supabaseServer } from "@/lib/supabase/server";
import { AI_QUOTA_ERROR_TERMS } from "@/lib/ai-provider-errors";

// ============================================================
// POST /api/ops/queue/requeue-ai-blocked
//
// Recovery for queue items that an AI-provider quota outage parked in
// NEEDS_ATTENTION (see lib/ai-provider-errors.ts). Run it after billing is
// restored. It only resets the items to QUEUED; the queue sweep then re-drives
// each one through the normal preflight, so an item that is unfit for another
// reason is flagged again with its real cause instead of being retried blindly.
//
// Safe by default: without `{"confirm": true}` it only reports what it would do.
// Body: { confirm?: boolean, limit?: number (1-500, default 200) }
// ============================================================

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  let body: { confirm?: unknown; limit?: unknown } = {};
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

  const errorFilter = AI_QUOTA_ERROR_TERMS.map((term) => `last_error.ilike.*${term}*`).join(",");

  const { data: blocked, error: loadError } = await supabaseServer
    .from("application_queue")
    .select("id")
    .eq("status", "NEEDS_ATTENTION")
    .or(errorFilter)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (loadError) {
    console.error("[queue:requeue-ai-blocked] failed to load items:", loadError);
    return Response.json(
      { success: false, error: "Failed to load blocked items." },
      { status: 500 }
    );
  }

  const ids = (blocked ?? []).map((row) => row.id as string);

  if (!confirm) {
    return Response.json({
      success: true,
      dry_run: true,
      matched: ids.length,
      has_more: ids.length === limit,
      note: 'Nothing was changed. Send {"confirm": true} to requeue these items.',
    });
  }

  if (ids.length === 0) {
    return Response.json({ success: true, dry_run: false, requeued: 0 });
  }

  const nowIso = new Date().toISOString();

  // The status guard makes this a no-op for any item a human resolved in the meantime.
  const { data: requeued, error: requeueError } = await supabaseServer
    .from("application_queue")
    .update({
      status: "QUEUED",
      category: "auto_matched",
      last_error: null,
      updated_at: nowIso,
    })
    .in("id", ids)
    .eq("status", "NEEDS_ATTENTION")
    .select("id");

  if (requeueError) {
    console.error("[queue:requeue-ai-blocked] failed to requeue:", requeueError);
    return Response.json(
      { success: false, error: "Failed to requeue items." },
      { status: 500 }
    );
  }

  const requeuedIds = (requeued ?? []).map((row) => row.id as string);

  if (requeuedIds.length > 0) {
    const { error: attentionError } = await supabaseServer
      .from("attention_items")
      .update({ status: "RESOLVED", resolved_at: nowIso })
      .in("queue_id", requeuedIds)
      .eq("status", "OPEN");

    if (attentionError) {
      // The queue reset already happened; a lingering attention row is cosmetic.
      console.error("[queue:requeue-ai-blocked] failed to resolve attention items:", attentionError);
    }
  }

  return Response.json({
    success: true,
    dry_run: false,
    requeued: requeuedIds.length,
    has_more: ids.length === limit,
  });
}
