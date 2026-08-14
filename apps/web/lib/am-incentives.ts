// ============================================================
// What an account manager earns (migration 121).
//
// Pure arithmetic. Nothing here reads or writes the database, so every
// number below can be tested and, more importantly, explained to the
// person being paid.
//
// ─── EVERY AMOUNT IN THIS FILE IS A PROPOSAL ─────────────────────────────
//
// The rates were derived from the unit economics discussed — $300
// registration, 2.5% of a ~$50k salary, base pay of $100–250/month — but
// none has been signed off. Treat them as a starting point for a decision,
// not as agreed policy. They live here rather than in the schema so that
// changing them is an edit, not a migration.
//
// ─── Why a percentage rather than a flat amount ──────────────────────────
//
// A flat 30,000 FCFA meant the AM's share SHRANK as placements got more
// valuable: 4% of the commission on a $50k placement, 1.7% on a $120k one.
// Nobody had a financial reason to push for a higher offer — the single
// highest-leverage thing an AM can influence late in a search — nor to
// resist a client negotiating the rate down, since the discount cost them
// nothing.
//
// A percentage of collected commission aligns all three parties: the AM,
// the client, and the business all now want the same thing, which is the
// largest possible offer at the agreed rate.
//
// ─── Currency ────────────────────────────────────────────────────────────
//
// Commissions are earned in the client's currency (USD) and bonuses are
// paid locally (XAF). The conversion is explicit and configurable because
// getting it wrong silently is a payroll error, not a rounding error.
// ============================================================

import {
  DIFFICULTY_MULTIPLIERS,
  effectiveTier,
  type DifficultyTier,
} from "./client-difficulty";

// ─── Configuration ───────────────────────────────────────────────────────

/** Share of the placement commission paid to the account manager. */
export const PLACEMENT_BONUS_RATE = 0.1;

/**
 * The floor, in XAF. Placing a modest-salary client into a good situation
 * must never pay less than the old flat bonus — otherwise the change
 * reads as a pay cut to exactly the people doing patient work at the
 * lower end of the market.
 */
export const PLACEMENT_BONUS_FLOOR_XAF = 30_000;

/** A ceiling, so one exceptional placement cannot distort a month's payroll. */
export const PLACEMENT_BONUS_CAP_XAF = 400_000;

/**
 * Paid once per client, when an interview actually happens. A five-month
 * search with a single payout at the end gives a new AM nothing to reach
 * for; this is deliberately small, because its job is feedback, not
 * income.
 */
export const FIRST_INTERVIEW_AWARD_XAF = 2_000;

/**
 * Share of the placement bonus held until the placement survives. Paying
 * purely on acceptance rewards putting someone into any job that will have
 * them; holding a portion back means the AM is paid for a placement that
 * lasted.
 */
export const SURVIVAL_WITHHOLD_SHARE = 0.2;
export const SURVIVAL_DAYS = 90;

/** Illustrative. Set from the rate you actually convert at. */
export const USD_TO_XAF = 600;

export type Currency = "XAF" | "USD";

// ─── Placement bonus ─────────────────────────────────────────────────────

export type PlacementBonusInput = {
  /** Commission for this placement, in `commissionCurrency`. */
  commissionAmount: number;
  commissionCurrency?: Currency;
  /** Difficulty tier in force for the client. */
  tier?: DifficultyTier;
  /** Conversion rate, overridable for testing or a changed rate. */
  usdToXaf?: number;
};

export type PlacementBonus = {
  /** Total earned, in XAF. */
  total: number;
  /** Paid on acceptance. */
  payable: number;
  /** Held until the placement survives SURVIVAL_DAYS. */
  withheld: number;
  multiplier: number;
  tier: DifficultyTier;
  /** Before the floor and cap were applied — for explaining the result. */
  computed: number;
  flooredAtMinimum: boolean;
  cappedAtMaximum: boolean;
};

function round(value: number): number {
  return Math.round(value);
}

/**
 * The placement bonus, difficulty-weighted, floored and capped.
 *
 * Rounding happens once at the end rather than at each step, so the parts
 * always sum to the total — a bonus whose halves do not add up is the
 * kind of thing people notice on a payslip.
 */
export function computePlacementBonus(
  input: PlacementBonusInput
): PlacementBonus {
  const tier = input.tier ?? "standard";
  const multiplier = DIFFICULTY_MULTIPLIERS[tier] ?? 1;
  const rate = input.usdToXaf ?? USD_TO_XAF;

  const commission = Math.max(0, Number(input.commissionAmount) || 0);
  const inXaf =
    (input.commissionCurrency ?? "USD") === "USD" ? commission * rate : commission;

  const computed = inXaf * PLACEMENT_BONUS_RATE * multiplier;

  const flooredAtMinimum = computed < PLACEMENT_BONUS_FLOOR_XAF;
  const cappedAtMaximum = computed > PLACEMENT_BONUS_CAP_XAF;

  const total = round(
    Math.min(PLACEMENT_BONUS_CAP_XAF, Math.max(PLACEMENT_BONUS_FLOOR_XAF, computed))
  );

  const withheld = round(total * SURVIVAL_WITHHOLD_SHARE);

  return {
    total,
    // Derived by subtraction so payable + withheld === total exactly.
    payable: total - withheld,
    withheld,
    multiplier,
    tier,
    computed: round(computed),
    flooredAtMinimum,
    cappedAtMaximum,
  };
}

/** A one-line explanation of how a bonus was arrived at. */
export function explainPlacementBonus(
  bonus: PlacementBonus,
  commissionAmount: number,
  currency: Currency = "USD"
): string {
  const basis = `${currency} ${commissionAmount.toLocaleString()}`;
  const parts = [
    `${Math.round(PLACEMENT_BONUS_RATE * 100)}% of ${basis}`,
    bonus.multiplier === 1 ? null : `×${bonus.multiplier} (${bonus.tier.replace("_", " ")})`,
  ].filter(Boolean);

  let line = `${parts.join(" ")} = ${bonus.total.toLocaleString()} XAF`;
  if (bonus.flooredAtMinimum) {
    line += ` (raised to the ${PLACEMENT_BONUS_FLOOR_XAF.toLocaleString()} minimum)`;
  }
  if (bonus.cappedAtMaximum) {
    line += ` (capped at ${PLACEMENT_BONUS_CAP_XAF.toLocaleString()})`;
  }
  if (bonus.withheld > 0) {
    line += `; ${bonus.withheld.toLocaleString()} held until ${SURVIVAL_DAYS} days`;
  }
  return line;
}

// ─── Survival ────────────────────────────────────────────────────────────

/**
 * Whether a placement has survived long enough to release the withheld
 * portion. A placement with no start date cannot be assessed, and returns
 * false rather than assuming the best — the money is owed either way, it
 * simply is not yet provable.
 */
export function hasSurvived(
  startDate: string | null | undefined,
  now: Date = new Date(),
  days: number = SURVIVAL_DAYS
): boolean {
  if (!startDate) return false;
  const started = Date.parse(
    startDate.length === 10 ? `${startDate}T00:00:00Z` : startDate
  );
  if (Number.isNaN(started)) return false;
  return now.getTime() - started >= days * 86_400_000;
}

/** The date the withheld portion becomes releasable. */
export function survivalDueDate(
  startDate: string,
  days: number = SURVIVAL_DAYS
): string | null {
  const started = Date.parse(
    startDate.length === 10 ? `${startDate}T00:00:00Z` : startDate
  );
  if (Number.isNaN(started)) return null;
  return new Date(started + days * 86_400_000).toISOString().slice(0, 10);
}

// ─── Award kinds ─────────────────────────────────────────────────────────

export const AWARD_KINDS = ["first_interview", "placement_survival"] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

export const AWARD_LABELS: Record<AwardKind, string> = {
  first_interview: "First interview",
  placement_survival: `${SURVIVAL_DAYS}-day survival`,
};

export function isAwardKind(value: unknown): value is AwardKind {
  return typeof value === "string" && AWARD_KINDS.includes(value as AwardKind);
}

export const AWARD_STATUSES = ["pending", "approved", "paid", "void"] as const;
export type AwardStatus = (typeof AWARD_STATUSES)[number];

export function isAwardStatus(value: unknown): value is AwardStatus {
  return typeof value === "string" && AWARD_STATUSES.includes(value as AwardStatus);
}

/**
 * Total owed to an AM across bonus records and awards. Only counts what
 * has been approved or paid — a pending award is a proposal, and showing
 * it as earned sets an expectation the review might not honour.
 */
export function sumEarned(
  awards: Array<{ amount: number; status: string }>
): { approved: number; paid: number; pending: number } {
  let approved = 0;
  let paid = 0;
  let pending = 0;

  for (const award of awards) {
    const amount = Number(award.amount) || 0;
    if (award.status === "paid") paid += amount;
    else if (award.status === "approved") approved += amount;
    else if (award.status === "pending") pending += amount;
  }

  return { approved, paid, pending };
}

/** Resolve the tier for a bonus from a stored assessment row. */
export function tierFromAssessment(
  assessment: { computed_tier: string; override_tier?: string | null } | null
): DifficultyTier {
  return assessment ? effectiveTier(assessment) : "standard";
}
