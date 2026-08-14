// ============================================================
// Turning an accepted offer into a bonus figure (migrations 120–122).
//
// The finance route used to write a flat 30,000. To compute a share of
// the commission instead, three things have to be found: what the
// placement actually earned, how hard the client was, and the rates in
// force. This module does that lookup and hands back both the amount and
// the working out, so the number written to payroll can be explained.
//
// ─── Finding the commission ──────────────────────────────────────────────
//
// accepted_offer_records carries no salary — the money lives on
// job_offers, which is a separate record of the same event. They are
// matched on the client, preferring an exact company match, because a
// client with two offers would otherwise be paid against whichever row
// happened to sort first.
//
// When no commission can be found the bonus falls back to the configured
// minimum rather than to zero. A placement that genuinely happened must
// never pay nothing because a billing record was late.
// ============================================================

import {
  computePlacementBonus,
  explainPlacementBonus,
  paymentMonthFor,
  type IncentiveSettings,
  type PlacementBonus,
} from "@/lib/am-incentives";
import { effectiveTier, type DifficultyTier } from "@/lib/client-difficulty";
import { loadIncentiveSettings } from "@/lib/incentive-settings";

export type ResolvedPlacementBonus = {
  bonus: PlacementBonus;
  settings: IncentiveSettings;
  tier: DifficultyTier;
  /** Commission the bonus was computed from, in USD. Null when unknown. */
  commissionAmount: number | null;
  /** Month the bonus belongs to, from the client's start date. */
  paymentMonth: string | null;
  /** One-line explanation, stored on the bonus record. */
  note: string;
};

function normaliseCompany(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Resolve everything needed to write a placement bonus.
 *
 * Never throws: a failure to read difficulty or commission degrades to
 * the safe defaults (standard tier, floor amount) rather than blocking
 * the finance workflow, because the alternative is an admin unable to
 * record a verified placement.
 */
export async function resolvePlacementBonus(input: {
  jobSeekerId: string | null;
  companyName?: string | null;
  clientStartDate?: string | null;
}): Promise<ResolvedPlacementBonus> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");
  const settings = await loadIncentiveSettings();

  let tier: DifficultyTier = "standard";
  let commissionAmount: number | null = null;

  if (input.jobSeekerId) {
    const [{ data: assessment }, { data: offers }] = await Promise.all([
      db
        .from("client_difficulty_assessments")
        .select("computed_tier, override_tier")
        .eq("job_seeker_id", input.jobSeekerId)
        .maybeSingle(),
      db
        .from("job_offers")
        .select("company, commission_amount, offer_accepted_at, status")
        .eq("job_seeker_id", input.jobSeekerId)
        .not("commission_amount", "is", null)
        .order("offer_accepted_at", { ascending: false })
        .limit(10),
    ]);

    if (assessment) tier = effectiveTier(assessment);

    const candidates = offers ?? [];
    const wanted = normaliseCompany(input.companyName);
    const matched =
      (wanted
        ? candidates.find((o) => normaliseCompany(o.company) === wanted)
        : null) ?? candidates[0];

    if (matched?.commission_amount != null) {
      const value = Number(matched.commission_amount);
      if (Number.isFinite(value) && value > 0) commissionAmount = value;
    }
  }

  const bonus = computePlacementBonus(
    { commissionAmount: commissionAmount ?? 0, tier },
    settings
  );

  const note =
    commissionAmount === null
      ? `No billing record found for this placement — paid at the configured minimum (${bonus.total.toLocaleString()} XAF). Recompute once the commission is recorded.`
      : explainPlacementBonus(bonus, commissionAmount);

  return {
    bonus,
    settings,
    tier,
    commissionAmount,
    paymentMonth: paymentMonthFor(input.clientStartDate),
    note,
  };
}
