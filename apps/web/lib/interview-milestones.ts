// ============================================================
// The first-interview milestone (migration 121).
//
// A placement bonus arrives at the end of a search that can run five
// months. For a new account manager who has never landed one, that is a
// long time to see nothing at all. This pays a small amount the first
// time a client actually reaches an interview — its job is feedback, not
// income, which is why it is deliberately a fraction of a placement.
//
// ─── Why a sweep rather than a hook ──────────────────────────────────────
//
// An interview can be marked as happened from at least two routes, and
// they do not even agree on the case of the status string (one writes
// "completed", another "COMPLETED"). Hooking each one means missing the
// next one somebody adds. A sweep asks the only question that matters —
// which clients have had an interview and have no milestone yet — and is
// immune to how the interview got there.
//
// Idempotency is the partial unique index on (job_seeker_id) where
// kind = 'first_interview', so a re-run cannot double-pay.
// ============================================================

import { createLogger } from "@/lib/logger";

const log = createLogger("interview-milestones");

/**
 * Statuses that mean the interview actually took place. Compared
 * case-insensitively because the two write paths disagree, and a
 * milestone that silently never fires is worse than a tolerant check.
 *
 * `confirmed` counts only once the scheduled time has passed — a
 * confirmed interview next week has not happened yet.
 */
export const HAPPENED_STATUSES = ["completed", "confirmed"] as const;

export function interviewHappened(
  interview: { status?: string | null; scheduled_at?: string | null },
  now: Date = new Date()
): boolean {
  const status = (interview.status ?? "").trim().toLowerCase();
  if (!HAPPENED_STATUSES.includes(status as (typeof HAPPENED_STATUSES)[number])) {
    return false;
  }
  if (status === "completed") return true;

  // confirmed: only once the time has passed.
  if (!interview.scheduled_at) return false;
  const at = Date.parse(interview.scheduled_at);
  return Number.isFinite(at) && at <= now.getTime();
}

export type MilestoneSweepResult = {
  considered: number;
  awarded: number;
  skipped: number;
};

/**
 * Award the milestone to every client who has reached an interview and
 * has not been paid for one yet.
 */
export async function sweepInterviewMilestones(
  now: Date = new Date()
): Promise<MilestoneSweepResult> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");
  const { loadIncentiveSettings } = await import("@/lib/incentive-settings");

  const settings = await loadIncentiveSettings();

  // Nothing configured means nothing to pay — skip the work entirely
  // rather than writing a stream of zero-value rows.
  if (!(settings.first_interview_award > 0)) {
    return { considered: 0, awarded: 0, skipped: 0 };
  }

  const { data: interviews, error } = await db
    .from("interviews")
    .select("id, job_seeker_id, account_manager_id, status, scheduled_at, created_at")
    .order("scheduled_at", { ascending: true })
    .limit(2000);

  if (error) {
    log.error("interview lookup failed", { error: error.message });
    throw new Error("Failed to load interviews.");
  }

  const happened = (interviews ?? []).filter((row) =>
    interviewHappened(
      {
        status: row.status as string | null,
        scheduled_at: row.scheduled_at as string | null,
      },
      now
    )
  );

  // Earliest qualifying interview per client — the milestone is for
  // getting there, so it belongs to whoever got them there first.
  const firstBySeeker = new Map<string, (typeof happened)[number]>();
  for (const row of happened) {
    const seekerId = row.job_seeker_id as string | null;
    if (!seekerId) continue;
    if (!firstBySeeker.has(seekerId)) firstBySeeker.set(seekerId, row);
  }

  if (firstBySeeker.size === 0) {
    return { considered: 0, awarded: 0, skipped: 0 };
  }

  const seekerIds = Array.from(firstBySeeker.keys());

  const { data: existing } = await db
    .from("am_incentive_awards")
    .select("job_seeker_id")
    .eq("kind", "first_interview")
    .in("job_seeker_id", seekerIds);

  const alreadyAwarded = new Set(
    (existing ?? []).map((row) => row.job_seeker_id as string)
  );

  let awarded = 0;
  let skipped = 0;

  for (const [seekerId, interview] of Array.from(firstBySeeker.entries())) {
    if (alreadyAwarded.has(seekerId)) {
      skipped += 1;
      continue;
    }

    const accountManagerId = interview.account_manager_id as string | null;
    if (!accountManagerId) {
      // No one to credit. Left unawarded rather than assigned to whoever
      // happens to hold the client now.
      skipped += 1;
      continue;
    }

    const { error: insertError } = await db.from("am_incentive_awards").insert({
      account_manager_id: accountManagerId,
      job_seeker_id: seekerId,
      kind: "first_interview",
      amount: settings.first_interview_award,
      currency: "XAF",
      source_interview_id: interview.id as string,
      status: "pending",
      note: "First interview reached for this client.",
    });

    if (insertError) {
      // 23505 is the partial unique index doing its job on a concurrent
      // run — the expected path, not a failure.
      if (insertError.code !== "23505") {
        log.warn("failed to award interview milestone", {
          job_seeker_id: seekerId,
          error: insertError.message,
        });
      }
      skipped += 1;
      continue;
    }

    awarded += 1;
  }

  log.info("interview milestone sweep complete", {
    considered: firstBySeeker.size,
    awarded,
    skipped,
  });

  return { considered: firstBySeeker.size, awarded, skipped };
}
