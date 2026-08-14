import { describe, it, expect } from "vitest";
import {
  FIRST_INTERVIEW_AWARD_XAF,
  PLACEMENT_BONUS_CAP_XAF,
  PLACEMENT_BONUS_FLOOR_XAF,
  PLACEMENT_BONUS_RATE,
  SURVIVAL_DAYS,
  SURVIVAL_WITHHOLD_SHARE,
  USD_TO_XAF,
  computePlacementBonus,
  explainPlacementBonus,
  hasSurvived,
  isAwardKind,
  sumEarned,
  survivalDueDate,
  tierFromAssessment,
} from "@/lib/am-incentives";

/** The discussed reality: $50k salary at 2.5% = $1,250 commission. */
const TYPICAL_COMMISSION = 1_250;

describe("computePlacementBonus", () => {
  it("pays a share of the commission on a typical placement", () => {
    const bonus = computePlacementBonus({ commissionAmount: TYPICAL_COMMISSION });
    // 10% of $1,250 = $125 → 75,000 XAF at 600/USD.
    expect(bonus.total).toBe(75_000);
    expect(bonus.multiplier).toBe(1);
    expect(bonus.flooredAtMinimum).toBe(false);
  });

  it("pays more for a harder client", () => {
    const standard = computePlacementBonus({ commissionAmount: TYPICAL_COMMISSION });
    const hard = computePlacementBonus({
      commissionAmount: TYPICAL_COMMISSION,
      tier: "hard",
    });
    const veryHard = computePlacementBonus({
      commissionAmount: TYPICAL_COMMISSION,
      tier: "very_hard",
    });

    expect(hard.total).toBe(standard.total * 1.5);
    expect(veryHard.total).toBe(standard.total * 2);
  });

  it("grows the AM's share as the placement grows — the old flat bonus shrank it", () => {
    const small = computePlacementBonus({ commissionAmount: 500 });
    const large = computePlacementBonus({ commissionAmount: 3_000 });
    expect(large.total).toBeGreaterThan(small.total);
  });

  it("never pays less than the old flat bonus", () => {
    // A tiny commission must not read as a pay cut to the person who
    // patiently placed a modest-salary client.
    const tiny = computePlacementBonus({ commissionAmount: 10 });
    expect(tiny.total).toBe(PLACEMENT_BONUS_FLOOR_XAF);
    expect(tiny.flooredAtMinimum).toBe(true);
  });

  it("caps an exceptional placement", () => {
    const huge = computePlacementBonus({ commissionAmount: 100_000 });
    expect(huge.total).toBe(PLACEMENT_BONUS_CAP_XAF);
    expect(huge.cappedAtMaximum).toBe(true);
  });

  it("splits into payable and withheld that sum exactly to the total", () => {
    // A bonus whose halves do not add up is what people notice on a payslip.
    for (const commission of [10, 1_250, 2_137, 9_999, 100_000]) {
      const bonus = computePlacementBonus({ commissionAmount: commission });
      expect(bonus.payable + bonus.withheld).toBe(bonus.total);
      expect(bonus.withheld).toBe(Math.round(bonus.total * SURVIVAL_WITHHOLD_SHARE));
    }
  });

  it("accepts a commission already in local currency", () => {
    const local = computePlacementBonus({
      commissionAmount: TYPICAL_COMMISSION * USD_TO_XAF,
      commissionCurrency: "XAF",
    });
    const usd = computePlacementBonus({ commissionAmount: TYPICAL_COMMISSION });
    expect(local.total).toBe(usd.total);
  });

  it("treats a negative or absent commission as zero, then floors it", () => {
    expect(computePlacementBonus({ commissionAmount: -500 }).total).toBe(
      PLACEMENT_BONUS_FLOOR_XAF
    );
    expect(
      computePlacementBonus({ commissionAmount: Number.NaN }).total
    ).toBe(PLACEMENT_BONUS_FLOOR_XAF);
  });

  it("honours an overridden conversion rate", () => {
    const bonus = computePlacementBonus({
      commissionAmount: TYPICAL_COMMISSION,
      usdToXaf: 1_000,
    });
    expect(bonus.total).toBe(TYPICAL_COMMISSION * PLACEMENT_BONUS_RATE * 1_000);
  });
});

describe("explainPlacementBonus", () => {
  it("shows the arithmetic rather than asserting a number", () => {
    const bonus = computePlacementBonus({
      commissionAmount: TYPICAL_COMMISSION,
      tier: "hard",
    });
    const line = explainPlacementBonus(bonus, TYPICAL_COMMISSION);

    expect(line).toContain("10%");
    expect(line).toContain("×1.5");
    expect(line).toContain("hard");
    expect(line).toContain(String(SURVIVAL_DAYS));
  });

  it("says when the floor was applied", () => {
    const bonus = computePlacementBonus({ commissionAmount: 10 });
    expect(explainPlacementBonus(bonus, 10)).toMatch(/minimum/i);
  });
});

describe("hasSurvived", () => {
  const start = "2026-05-01";

  it("is false before the window and true after", () => {
    expect(hasSurvived(start, new Date("2026-07-01T00:00:00Z"))).toBe(false);
    expect(hasSurvived(start, new Date("2026-08-01T00:00:00Z"))).toBe(true);
  });

  it("is true exactly on the boundary", () => {
    const due = survivalDueDate(start)!;
    expect(hasSurvived(start, new Date(`${due}T00:00:00Z`))).toBe(true);
  });

  it("returns false rather than assuming the best when the date is unknown", () => {
    expect(hasSurvived(null)).toBe(false);
    expect(hasSurvived(undefined)).toBe(false);
    expect(hasSurvived("not a date")).toBe(false);
  });

  it("computes the due date as start plus the window", () => {
    expect(survivalDueDate("2026-05-01")).toBe("2026-07-30");
    expect(survivalDueDate("nonsense")).toBeNull();
  });
});

describe("sumEarned", () => {
  it("keeps pending separate from earned", () => {
    // A pending award is a proposal; showing it as earned sets an
    // expectation the review might not honour.
    const totals = sumEarned([
      { amount: 75_000, status: "paid" },
      { amount: 30_000, status: "approved" },
      { amount: 2_000, status: "pending" },
      { amount: 99_000, status: "void" },
    ]);

    expect(totals).toEqual({ paid: 75_000, approved: 30_000, pending: 2_000 });
  });

  it("handles an empty list", () => {
    expect(sumEarned([])).toEqual({ paid: 0, approved: 0, pending: 0 });
  });
});

describe("helpers", () => {
  it("recognises award kinds", () => {
    expect(isAwardKind("first_interview")).toBe(true);
    expect(isAwardKind("placement")).toBe(false);
  });

  it("defaults a missing assessment to the standard tier", () => {
    expect(tierFromAssessment(null)).toBe("standard");
    expect(
      tierFromAssessment({ computed_tier: "standard", override_tier: "very_hard" })
    ).toBe("very_hard");
  });

  it("keeps the interview milestone small enough to be feedback, not income", () => {
    const bonus = computePlacementBonus({ commissionAmount: TYPICAL_COMMISSION });
    expect(FIRST_INTERVIEW_AWARD_XAF).toBeLessThan(bonus.total / 10);
  });
});
