// ============================================================
// Placement fee (commission) computation — Client Collaboration Agreement §6/§7.
//
//   fee  = 5% of (base salary + guaranteed cash compensation)
//   due  = 2 months after the employment START date
//   ext  = 3 months after the employment START date (approved extension)
//
// When the start date is unknown, the offer-acceptance date is used as the
// anchor. Extracted as a pure function so the money math is unit-tested.
//
// ─── The rate is negotiable, and now recorded ────────────────────────────
//
// The 5% below is the agreement's headline rate, but clients negotiate it
// — commonly to 2.5%, which is half the revenue on a placement. Until
// migration 121 that discount lived nowhere: the fee was always computed
// at 5%, so nothing downstream could tell a full-rate placement from a
// discounted one, and nobody's pay depended on which it was.
//
// `rate` makes the agreed figure explicit and stored per offer. That is a
// prerequisite for paying account managers a share of what was actually
// collected: when the AM in the negotiation has a stake in the rate, the
// rate stops sliding by default.
// ============================================================

/** The headline rate. Individual offers may be agreed below this. */
export const PLACEMENT_FEE_RATE = 0.05;

/** Below this, a discount needs deliberate approval rather than a shrug. */
export const MIN_REASONABLE_FEE_RATE = 0.02;

/** Clamp a stored or submitted rate into a sane band. */
export function normalizeFeeRate(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return PLACEMENT_FEE_RATE;
  // Accept 2.5 as well as 0.025 — the admin UI and the database disagree
  // about percentages often enough that guessing wrong is a real risk.
  const asFraction = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0, asFraction));
}

export interface PlacementFee {
  commissionAmount: number;
  /** The rate actually applied, so callers can persist it. */
  rate: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  /** ISO date (YYYY-MM-DD). */
  extendedDueDate: string;
}

export function computePlacementFee(input: {
  baseSalary: number;
  guaranteedCompensation?: number | null;
  /** Agreed rate for this placement. Defaults to the headline 5%. */
  rate?: number | null;
  /** Employment start date (preferred anchor). */
  startDate?: string | null;
  /** Offer-acceptance date (fallback anchor). */
  offerAcceptedAt: string;
}): PlacementFee {
  const guaranteed = Number(input.guaranteedCompensation) || 0;
  const rate =
    input.rate === null || input.rate === undefined
      ? PLACEMENT_FEE_RATE
      : normalizeFeeRate(input.rate);
  const commissionAmount = (Number(input.baseSalary) + guaranteed) * rate;

  const anchor = new Date(input.startDate ?? input.offerAcceptedAt);
  const dueDate = new Date(anchor);
  dueDate.setMonth(dueDate.getMonth() + 2);
  const extendedDueDate = new Date(anchor);
  extendedDueDate.setMonth(extendedDueDate.getMonth() + 3);

  return {
    commissionAmount,
    rate,
    dueDate: dueDate.toISOString().split("T")[0],
    extendedDueDate: extendedDueDate.toISOString().split("T")[0],
  };
}
