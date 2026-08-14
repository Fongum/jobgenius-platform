import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_MULTIPLIERS,
  HARD_THRESHOLD,
  VERY_HARD_THRESHOLD,
  assessDifficulty,
  effectiveTier,
  isLocked,
  multiplierFor,
  type DifficultySignals,
} from "@/lib/client-difficulty";

function signals(overrides: Partial<DifficultySignals> = {}): DifficultySignals {
  return { strongMatches: 30, ...overrides };
}

describe("assessDifficulty", () => {
  it("rates a healthy search as standard", () => {
    const result = assessDifficulty(signals());
    expect(result.tier).toBe("standard");
    expect(result.multiplier).toBe(1);
  });

  it("treats an empty match pool as the strongest single signal", () => {
    const result = assessDifficulty(signals({ strongMatches: 0 }));
    expect(result.score).toBeGreaterThanOrEqual(HARD_THRESHOLD);
    expect(result.tier).toBe("hard");
    expect(result.reasons.join(" ")).toMatch(/No strongly matching jobs/i);
  });

  it("credits a deep match pool, but never below zero", () => {
    const deep = assessDifficulty(signals({ strongMatches: 100 }));
    expect(deep.score).toBe(0);
    expect(deep.tier).toBe("standard");
  });

  it("needs two real obstacles to reach very hard", () => {
    // The tier that doubles pay should be genuinely uncommon.
    const one = assessDifficulty(signals({ restrictedAuthorization: true }));
    expect(one.tier).not.toBe("very_hard");

    const several = assessDifficulty(
      signals({
        strongMatches: 3,
        restrictedAuthorization: true,
        experienceGap: true,
      })
    );
    expect(several.score).toBeGreaterThanOrEqual(VERY_HARD_THRESHOLD);
    expect(several.tier).toBe("very_hard");
    expect(several.multiplier).toBe(2);
  });

  it("scales the employment-gap contribution with its length", () => {
    const short = assessDifficulty(signals({ employmentGapMonths: 3 }));
    const medium = assessDifficulty(signals({ employmentGapMonths: 8 }));
    const long = assessDifficulty(signals({ employmentGapMonths: 24 }));

    expect(short.score).toBe(0);
    expect(medium.score).toBeGreaterThan(short.score);
    expect(long.score).toBeGreaterThan(medium.score);
  });

  it("treats a senior target as harder, not easier", () => {
    // Fewer roles exist at the top, not more.
    const senior = assessDifficulty(signals({ seniorTarget: true }));
    expect(senior.score).toBeGreaterThan(assessDifficulty(signals()).score);
  });

  it("always explains itself", () => {
    expect(assessDifficulty(signals()).reasons).not.toHaveLength(0);
    expect(
      assessDifficulty(signals({ strongMatches: 2 })).reasons.join(" ")
    ).toContain("2");
  });

  it("does not count a missing signal as an obstacle", () => {
    // Undefined must not read as "yes" — that would inflate every tier.
    const sparse = assessDifficulty({ strongMatches: 30 });
    const explicit = assessDifficulty(
      signals({
        experienceGap: false,
        restrictedAuthorization: false,
        employmentGapMonths: 0,
        salaryExpectationRatio: 1,
      })
    );
    expect(sparse.score).toBe(explicit.score);
  });
});

describe("effectiveTier and multiplierFor", () => {
  it("lets an override beat the computed tier", () => {
    expect(
      effectiveTier({ computed_tier: "standard", override_tier: "very_hard" })
    ).toBe("very_hard");
  });

  it("falls back to the computed tier when there is no override", () => {
    expect(effectiveTier({ computed_tier: "hard", override_tier: null })).toBe(
      "hard"
    );
  });

  it("never pays double on an unrecognised tier", () => {
    // A bad value must fail safe to the cheapest multiplier.
    expect(effectiveTier({ computed_tier: "impossible" })).toBe("standard");
    expect(
      effectiveTier({ computed_tier: "hard", override_tier: "nonsense" })
    ).toBe("hard");
  });

  it("defaults a missing assessment to the standard multiplier", () => {
    expect(multiplierFor(null)).toBe(DIFFICULTY_MULTIPLIERS.standard);
  });

  it("resolves the multiplier through the override", () => {
    expect(
      multiplierFor({ computed_tier: "standard", override_tier: "hard" })
    ).toBe(1.5);
  });
});

describe("isLocked", () => {
  it("is true only once the tier has been settled", () => {
    expect(isLocked(null)).toBe(false);
    expect(isLocked({ locked_at: null })).toBe(false);
    expect(isLocked({ locked_at: "2026-08-14T10:00:00Z" })).toBe(true);
  });
});
