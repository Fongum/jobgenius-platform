// ============================================================
// Recruiter identity and per-thread pipeline stage for outreach.
//
// Two rules live here, both added after they were broken in production
// code paths (migration 123):
//
//   1. One recruiter per email. Lookups used to compare emails exactly and
//      read with .maybeSingle(), so "Jane@X.com" and "jane@x.com" became two
//      recruiters, and once two rows shared an address the lookup errored,
//      came back null, and the opt-out check that depended on it was skipped.
//      Emails are now stored trimmed + lowercased (a trigger enforces it) and
//      unique; find-or-create recovers from the insert race instead of
//      creating a second row.
//
//   2. Stage belongs to the thread, not the recruiter. A recruiter is shared
//      by every seeker who has written to them, so writing "CLOSED" or
//      "INTERVIEWING" to recruiters.status changed what every other AM saw.
//      recruiter_threads.stage is the per-seeker pipeline position;
//      recruiters.status is left for recruiter-wide facts (opt-out, bounce,
//      the partner pipeline).
// ============================================================

import { supabaseServer } from "@/lib/supabase/server";

export const OUTREACH_STAGES = [
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "INTERVIEWING",
  "CLOSED",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export function isOutreachStage(value: unknown): value is OutreachStage {
  return typeof value === "string" && (OUTREACH_STAGES as readonly string[]).includes(value);
}

/**
 * The stages an automatic event may move a thread out of on its way to
 * `target`: everything earlier in the pipeline. A follow-up send must not
 * knock an ENGAGED thread back to CONTACTED, and nothing automatic reopens
 * a CLOSED one. Manual stage changes from the AM bypass this.
 */
export function stagesBefore(target: OutreachStage): OutreachStage[] {
  if (target === "CLOSED") return [];
  const index = OUTREACH_STAGES.indexOf(target);
  return OUTREACH_STAGES.slice(0, index).filter((stage) => stage !== "CLOSED");
}

/** Mirrors the DB trigger: trimmed, lowercased, empty -> null. */
export function normalizeRecruiterEmail(email: string | null | undefined): string | null {
  const normalized = String(email ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function findRecruiterIdByEmail(
  email: string | null | undefined
): Promise<string | null> {
  const normalized = normalizeRecruiterEmail(email);
  if (!normalized) return null;

  const { data } = await supabaseServer
    .from("recruiters")
    .select("id")
    .eq("email", normalized)
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

export type NewRecruiterFields = {
  email: string;
  name?: string | null;
  title?: string | null;
  company?: string | null;
  source: string;
};

export type FindOrCreateRecruiterResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";

export async function findOrCreateRecruiter(
  fields: NewRecruiterFields
): Promise<FindOrCreateRecruiterResult> {
  const email = normalizeRecruiterEmail(fields.email);
  if (!email) return { ok: false, error: "Recruiter email missing." };

  const existingId = await findRecruiterIdByEmail(email);
  if (existingId) return { ok: true, id: existingId, created: false };

  const { data: inserted, error } = await supabaseServer
    .from("recruiters")
    .insert({
      email,
      name: fields.name ?? email,
      title: fields.title ?? null,
      company: fields.company ?? null,
      source: fields.source,
      status: "NEW",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (inserted?.id) return { ok: true, id: inserted.id as string, created: true };

  // Another request created the same recruiter between our read and our
  // insert. The unique index turned that into an error; the row it lost to
  // is the one to use.
  if (error?.code === UNIQUE_VIOLATION) {
    const winnerId = await findRecruiterIdByEmail(email);
    if (winnerId) return { ok: true, id: winnerId, created: false };
  }

  return { ok: false, error: error?.message ?? "Failed to create recruiter." };
}

/**
 * Moves a thread forward to `stage` only if it is currently earlier in the
 * pipeline. Safe to call on every send or reply.
 */
export async function advanceThreadStage(
  threadId: string,
  stage: OutreachStage,
  nowIso: string = new Date().toISOString()
) {
  const from = stagesBefore(stage);
  if (from.length === 0) return;

  await supabaseServer
    .from("recruiter_threads")
    .update({ stage, updated_at: nowIso })
    .eq("id", threadId)
    .in("stage", from);
}

/**
 * Bookkeeping after an outbound email in a thread: the thread moves to
 * CONTACTED if it was NEW, and the recruiter records when anyone last wrote
 * to them. The recruiter-wide status only moves NEW -> CONTACTED, which is
 * true for every seeker at once; it never overwrites a later status.
 */
export async function recordOutboundContact({
  recruiterId,
  threadId,
  nowIso,
}: {
  recruiterId: string;
  threadId: string;
  nowIso: string;
}) {
  await Promise.all([
    advanceThreadStage(threadId, "CONTACTED", nowIso),
    supabaseServer
      .from("recruiters")
      .update({ last_contacted_at: nowIso, updated_at: nowIso })
      .eq("id", recruiterId),
    supabaseServer
      .from("recruiters")
      .update({ status: "CONTACTED", updated_at: nowIso })
      .eq("id", recruiterId)
      .eq("status", "NEW"),
  ]);
}
