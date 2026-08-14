// ============================================================
// How hard is this client to place (migration 120).
//
// Pure scoring. The loader lives at the bottom and is the only part that
// touches the database.
//
// ─── Why these signals ───────────────────────────────────────────────────
//
// The strongest predictor is already computed and sitting in
// job_match_scores: how many live jobs actually score well for this
// person. A client with forty strong matches and one with four are not
// the same job, and no amount of intake paperwork tells you that as
// directly as the matching engine already does.
//
// The rest are intake facts that shift the odds and are knowable on day
// one: seniority (senior roles are rarer, not more plentiful), an
// experience gap against the target role, work authorization, an
// employment gap, and a salary expectation above market.
//
// ─── What this deliberately does not do ──────────────────────────────────
//
// It does not judge the person. Every signal is about the difficulty of
// the *search*, not the worth of the candidate, and the tier is shown to
// the AM as a workload and pay signal. A "very hard" client is not a bad
// client — they are the one you should be sending your best consultant to,
// which is exactly what paying 2x is meant to achieve.
// ============================================================

export const DIFFICULTY_TIERS = ["standard", "hard", "very_hard"] as const;
export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number];

export function isDifficultyTier(value: unknown): value is DifficultyTier {
  return (
    typeof value === "string" &&
    DIFFICULTY_TIERS.includes(value as DifficultyTier)
  );
}

/**
 * Bonus multiplier per tier. Coarse on purpose — see migration 120 on why
 * three bands beat a continuous score for anything that determines pay.
 */
export const DIFFICULTY_MULTIPLIERS: Record<DifficultyTier, number> = {
  standard: 1.0,
  hard: 1.5,
  very_hard: 2.0,
};

export const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  standard: "Standard",
  hard: "Hard",
  very_hard: "Very hard",
};

/**
 * Score thresholds. Higher score means harder. Tuned so that a client with
 * a healthy match pool and no complicating factors lands in `standard`,
 * and it takes two or more real obstacles to reach `very_hard` — the tier
 * that doubles the payout should be genuinely uncommon.
 */
export const HARD_THRESHOLD = 3;
export const VERY_HARD_THRESHOLD = 6;

/** A strong match, for the purpose of counting the pool. */
export const STRONG_MATCH_SCORE = 70;

export type DifficultySignals = {
  /** Live jobs scoring at or above STRONG_MATCH_SCORE for this seeker. */
  strongMatches: number;
  /** Years of relevant experience, if known. */
  yearsExperience?: number | null;
  /** Target role is a step up from anything they have held. */
  experienceGap?: boolean;
  /** Needs sponsorship, or is restricted to a narrow location. */
  restrictedAuthorization?: boolean;
  /** Months since last employment, if any. */
  employmentGapMonths?: number | null;
  /** Their expectation as a multiple of market for the target role. */
  salaryExpectationRatio?: number | null;
  /** Senior/executive targets — a smaller market, not a larger one. */
  seniorTarget?: boolean;
};

export type DifficultyAssessment = {
  tier: DifficultyTier;
  score: number;
  multiplier: number;
  /** Human-readable contributions, for showing the AM why. */
  reasons: string[];
};

function tierForScore(score: number): DifficultyTier {
  if (score >= VERY_HARD_THRESHOLD) return "very_hard";
  if (score >= HARD_THRESHOLD) return "hard";
  return "standard";
}

/**
 * Score a client. Every contribution is additive and named, so the result
 * can be explained rather than merely asserted.
 */
export function assessDifficulty(
  signals: DifficultySignals
): DifficultyAssessment {
  let score = 0;
  const reasons: string[] = [];

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  // The match pool: the single strongest signal, and the only one that
  // reflects the live market rather than the client's history.
  const matches = Math.max(0, signals.strongMatches);
  if (matches === 0) {
    add(4, "No strongly matching jobs currently available");
  } else if (matches < 5) {
    add(3, `Only ${matches} strongly matching job${matches === 1 ? "" : "s"} available`);
  } else if (matches < 15) {
    add(1.5, `Thin match pool (${matches} strong matches)`);
  } else if (matches >= 40) {
    add(-1, `Deep match pool (${matches} strong matches)`);
  }

  if (signals.restrictedAuthorization) {
    add(2, "Needs sponsorship or is location-restricted");
  }

  if (signals.experienceGap) {
    add(1.5, "Targeting a level above their current experience");
  }

  if (signals.seniorTarget) {
    add(1, "Senior target — fewer roles exist at this level");
  }

  const gap = signals.employmentGapMonths ?? 0;
  if (gap >= 12) {
    add(1.5, `Employment gap of ${gap} months`);
  } else if (gap >= 6) {
    add(1, `Employment gap of ${gap} months`);
  }

  const ratio = signals.salaryExpectationRatio ?? null;
  if (ratio !== null && ratio >= 1.3) {
    add(1.5, "Salary expectation well above market for the target role");
  } else if (ratio !== null && ratio >= 1.15) {
    add(1, "Salary expectation above market for the target role");
  }

  const years = signals.yearsExperience ?? null;
  if (years !== null && years < 1) {
    add(1.5, "Little or no professional experience");
  }

  // Never let credits push a client below the floor: a deep match pool
  // makes a search easier, it does not make it negative work.
  const finalScore = Math.max(0, Math.round(score * 100) / 100);
  const tier = tierForScore(finalScore);

  if (reasons.length === 0) {
    reasons.push("No complicating factors identified");
  }

  return {
    tier,
    score: finalScore,
    multiplier: DIFFICULTY_MULTIPLIERS[tier],
    reasons,
  };
}

/** The tier in force: an override beats the computed value. */
export function effectiveTier(assessment: {
  computed_tier: string;
  override_tier?: string | null;
}): DifficultyTier {
  if (isDifficultyTier(assessment.override_tier)) return assessment.override_tier;
  if (isDifficultyTier(assessment.computed_tier)) return assessment.computed_tier;
  // An unrecognised tier must not silently pay double.
  return "standard";
}

export function multiplierFor(assessment: {
  computed_tier: string;
  override_tier?: string | null;
} | null): number {
  if (!assessment) return DIFFICULTY_MULTIPLIERS.standard;
  return DIFFICULTY_MULTIPLIERS[effectiveTier(assessment)];
}

/** Locked assessments are settled and must not be reassessed. */
export function isLocked(assessment: { locked_at?: string | null } | null): boolean {
  return Boolean(assessment?.locked_at);
}

// ─── Loading ─────────────────────────────────────────────────────────────

/**
 * Gather the signals for a client from what the platform already knows.
 * Anything unavailable is left undefined rather than guessed — a missing
 * signal should not silently read as "no obstacle".
 */
export async function loadDifficultySignals(
  jobSeekerId: string
): Promise<DifficultySignals> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");

  const [{ count: strongMatches }, { data: seeker }] = await Promise.all([
    db
      .from("job_match_scores")
      .select("id", { count: "exact", head: true })
      .eq("job_seeker_id", jobSeekerId)
      .gte("score", STRONG_MATCH_SCORE)
      .is("archived_at", null),
    db
      .from("job_seekers")
      .select("work_history, education, target_role, years_experience")
      .eq("id", jobSeekerId)
      .maybeSingle(),
  ]);

  const signals: DifficultySignals = {
    strongMatches: strongMatches ?? 0,
  };

  const years = seeker?.years_experience;
  if (typeof years === "number") signals.yearsExperience = years;

  return signals;
}
