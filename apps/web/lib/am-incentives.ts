// ============================================================
// What an account manager earns (migrations 120–122).
//
// Pure arithmetic. Nothing here reads or writes the database, so every
// number below can be tested and, more importantly, explained to the
// person being paid.
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
// A percentage of commission aligns all three parties: the AM, the client
// and the business all now want the same thing, which is the largest
// possible offer at the agreed rate.
//
// ─── When it is paid ─────────────────────────────────────────────────────
//
// At month end of the month the client actually STARTS the job, not when
// the offer is accepted. Offers get rescinded and people fail to show up;
// a start date is the first moment the placement is real. It is also when
// the commission clock starts, so the money going out is timed with the
// money coming in.
//
// ─── Rates are settings, not constants ───────────────────────────────────
//
// Everything below is a DEFAULT. The values in force live in the database
// (migration 122) and are editable by an admin without a deploy. Each
// bonus record snapshots the rate and multiplier it was computed with, so
// changing a rate never rewrites history — a bonus paid last quarter can
// still be explained with the numbers that produced it.
//
// ─── Currency ────────────────────────────────────────────────────────────
//
// Commissions are earned in the client's currency (USD) and bonuses paid
// locally (XAF). The conversion is explicit and configurable, because
// getting it wrong silently is a payroll error, not a rounding error.
// ============================================================

import { DIFFICULTY_MULTIPLIERS, effectiveTier, type DifficultyTier } from "./client-difficulty";

// ─── Settings ────────────────────────────────────────────────────────────

export type IncentiveSettings = {
  /** Share of the placement commission paid to the account manager. */
  placement_bonus_rate: number;
  /**
   * The floor, in XAF. Placing a modest-salary client into a good
   * situation must never pay less than the old flat bonus — otherwise the
   * change reads as a pay cut to exactly the people doing patient work at
   * the lower end of the market.
   */
  placement_bonus_floor: number;
  /** A ceiling, so one exceptional placement cannot distort a month's payroll. */
  placement_bonus_cap: number;
  /**
   * Paid once per client, when an interview actually happens. A five-month
   * search with a single payout at the end gives a new AM nothing to reach
   * for; this is deliberately small, because its job is feedback, not
   * income.
   */
  first_interview_award: number;
  /** Conversion applied to commissions earned in USD. */
  usd_to_xaf: number;
};

export const DEFAULT_INCENTIVE_SETTINGS: IncentiveSettings = {
  placement_bonus_rate: 0.1,
  placement_bonus_floor: 30_000,
  placement_bonus_cap: 400_000,
  first_interview_award: 2_000,
  usd_to_xaf: 600,
};

/** Bounds that stop a typo becoming a payroll incident. */
export const SETTING_BOUNDS: Record<
  keyof IncentiveSettings,
  { min: number; max: number; label: string; isRate?: boolean }
> = {
  placement_bonus_rate: {
    min: 0,
    max: 0.5,
    label: "Placement bonus rate",
    isRate: true,
  },
  placement_bonus_floor: { min: 0, max: 1_000_000, label: "Minimum bonus" },
  placement_bonus_cap: { min: 0, max: 10_000_000, label: "Maximum bonus" },
  first_interview_award: { min: 0, max: 100_000, label: "First interview award" },
  usd_to_xaf: { min: 1, max: 10_000, label: "USD → XAF rate" },
};

export const SETTING_KEYS = Object.keys(
  DEFAULT_INCENTIVE_SETTINGS
) as Array<keyof IncentiveSettings>;

/**
 * Validate a proposed settings change. Returns the errors rather than
 * throwing, so an admin form can show all of them at once.
 *
 * The floor/cap ordering check matters: a floor above the cap would make
 * every bonus land on one of the two bounds, silently, with the
 * arithmetic in between doing nothing.
 */
export function validateSettings(
  input: Partial<IncentiveSettings>
): { ok: true; settings: Partial<IncentiveSettings> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const cleaned: Partial<IncentiveSettings> = {};

  for (const key of SETTING_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;

    const value = typeof raw === "number" ? raw : Number(raw);
    const bounds = SETTING_BOUNDS[key];

    if (!Number.isFinite(value)) {
      errors.push(`${bounds.label} must be a number.`);
      continue;
    }
    if (value < bounds.min || value > bounds.max) {
      errors.push(
        `${bounds.label} must be between ${bounds.min} and ${bounds.max}.`
      );
      continue;
    }
    cleaned[key] = value;
  }

  const floor = cleaned.placement_bonus_floor;
  const cap = cleaned.placement_bonus_cap;
  if (floor !== undefined && cap !== undefined && floor > cap) {
    errors.push("The minimum bonus cannot be above the maximum.");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, settings: cleaned };
}

/** Fill any missing key from the defaults, so callers always get a whole object. */
export function withDefaults(
  partial: Partial<IncentiveSettings> | null | undefined
): IncentiveSettings {
  const merged = { ...DEFAULT_INCENTIVE_SETTINGS };
  if (!partial) return merged;
  for (const key of SETTING_KEYS) {
    const value = partial[key];
    if (typeof value === "number" && Number.isFinite(value)) merged[key] = value;
  }
  return merged;
}

export type Currency = "XAF" | "USD";

// ─── Placement bonus ─────────────────────────────────────────────────────

export type PlacementBonusInput = {
  /** Commission for this placement, in `commissionCurrency`. */
  commissionAmount: number;
  commissionCurrency?: Currency;
  /** Difficulty tier in force for the client. */
  tier?: DifficultyTier;
};

export type PlacementBonus = {
  /** Total earned, in XAF. Paid in full at month end of the start date. */
  total: number;
  multiplier: number;
  tier: DifficultyTier;
  /** The rate used, snapshotted onto the bonus record. */
  rate: number;
  /** Before the floor and cap were applied — for explaining the result. */
  computed: number;
  flooredAtMinimum: boolean;
  cappedAtMaximum: boolean;
};

export function computePlacementBonus(
  input: PlacementBonusInput,
  settings: IncentiveSettings = DEFAULT_INCENTIVE_SETTINGS
): PlacementBonus {
  const tier = input.tier ?? "standard";
  const multiplier = DIFFICULTY_MULTIPLIERS[tier] ?? 1;

  const commission = Math.max(0, Number(input.commissionAmount) || 0);
  const inXaf =
    (input.commissionCurrency ?? "USD") === "USD"
      ? commission * settings.usd_to_xaf
      : commission;

  const computed = inXaf * settings.placement_bonus_rate * multiplier;

  const flooredAtMinimum = computed < settings.placement_bonus_floor;
  const cappedAtMaximum = computed > settings.placement_bonus_cap;

  const total = Math.round(
    Math.min(
      settings.placement_bonus_cap,
      Math.max(settings.placement_bonus_floor, computed)
    )
  );

  return {
    total,
    multiplier,
    tier,
    rate: settings.placement_bonus_rate,
    computed: Math.round(computed),
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
  const parts = [
    `${Math.round(bonus.rate * 100)}% of ${currency} ${commissionAmount.toLocaleString()}`,
    bonus.multiplier === 1
      ? null
      : `×${bonus.multiplier} (${bonus.tier.replace("_", " ")})`,
  ].filter(Boolean);

  let line = `${parts.join(" ")} = ${bonus.total.toLocaleString()} XAF`;
  if (bonus.flooredAtMinimum) line += " (raised to the minimum)";
  if (bonus.cappedAtMaximum) line += " (capped at the maximum)";
  return line;
}

// ─── When it becomes payable ─────────────────────────────────────────────

/**
 * The month a placement bonus belongs to: the month the client actually
 * starts the job. Returned as the first of that month, matching
 * employee_bonus_records.payment_month.
 */
export function paymentMonthFor(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  const iso = startDate.length === 10 ? `${startDate}T00:00:00Z` : startDate;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Whether the bonus can be paid: the client has actually started.
 *
 * A future start date is not payable, and a missing one is not payable
 * either — an offer without a start date has not become a job yet, and
 * assuming otherwise pays for placements that never happened.
 */
export function isBonusPayable(
  startDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!startDate) return false;
  const iso = startDate.length === 10 ? `${startDate}T00:00:00Z` : startDate;
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return false;
  return started <= now.getTime();
}

/** Human-readable status for a bonus awaiting its start date. */
export function payabilityNote(
  startDate: string | null | undefined,
  now: Date = new Date()
): string {
  if (!startDate) return "Awaiting a confirmed start date";
  if (!isBonusPayable(startDate, now)) return `Payable after the client starts on ${startDate}`;
  const month = paymentMonthFor(startDate);
  return month ? `Payable in the ${month.slice(0, 7)} payroll` : "Payable";
}

// ─── Award kinds ─────────────────────────────────────────────────────────

export const AWARD_KINDS = ["first_interview"] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

export const AWARD_LABELS: Record<AwardKind, string> = {
  first_interview: "First interview",
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
 * Total owed to an AM. Pending is kept separate from earned: a pending
 * award is a proposal, and showing it as earned sets an expectation the
 * review might not honour.
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

export function formatXaf(amount: number): string {
  return `${Math.round(amount).toLocaleString()} XAF`;
}
