import { describe, it, expect } from "vitest";
import {
  DEFAULT_INCENTIVE_SETTINGS,
  computePlacementBonus,
  explainPlacementBonus,
  isAwardKind,
  isBonusPayable,
  payabilityNote,
  paymentMonthFor,
  sumEarned,
  tierFromAssessment,
  validateSettings,
  withDefaults,
  type IncentiveSettings,
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

  it("never pays less than the configured minimum", () => {
    const tiny = computePlacementBonus({ commissionAmount: 10 });
    expect(tiny.total).toBe(DEFAULT_INCENTIVE_SETTINGS.placement_bonus_floor);
    expect(tiny.flooredAtMinimum).toBe(true);
  });

  it("caps an exceptional placement", () => {
    const huge = computePlacementBonus({ commissionAmount: 100_000 });
    expect(huge.total).toBe(DEFAULT_INCENTIVE_SETTINGS.placement_bonus_cap);
    expect(huge.cappedAtMaximum).toBe(true);
  });

  it("pays the whole bonus at once — nothing is withheld", () => {
    const bonus = computePlacementBonus({ commissionAmount: TYPICAL_COMMISSION });
    expect(bonus).not.toHaveProperty("withheld");
    expect(bonus.total).toBe(75_000);
  });

  it("uses the settings it is given rather than the defaults", () => {
    const settings: IncentiveSettings = {
      ...DEFAULT_INCENTIVE_SETTINGS,
      placement_bonus_rate: 0.2,
      usd_to_xaf: 700,
    };
    const bonus = computePlacementBonus(
      { commissionAmount: TYPICAL_COMMISSION },
      settings
    );
    expect(bonus.total).toBe(TYPICAL_COMMISSION * 700 * 0.2);
    // The rate is snapshotted so the record can explain itself later.
    expect(bonus.rate).toBe(0.2);
  });

  it("accepts a commission already in local currency", () => {
    const local = computePlacementBonus({
      commissionAmount: TYPICAL_COMMISSION * DEFAULT_INCENTIVE_SETTINGS.usd_to_xaf,
      commissionCurrency: "XAF",
    });
    expect(local.total).toBe(
      computePlacementBonus({ commissionAmount: TYPICAL_COMMISSION }).total
    );
  });

  it("treats a negative or absent commission as zero, then floors it", () => {
    const floor = DEFAULT_INCENTIVE_SETTINGS.placement_bonus_floor;
    expect(computePlacementBonus({ commissionAmount: -500 }).total).toBe(floor);
    expect(computePlacementBonus({ commissionAmount: Number.NaN }).total).toBe(floor);
  });
});

describe("payment timing", () => {
  it("belongs to the month the client starts", () => {
    expect(paymentMonthFor("2026-09-14")).toBe("2026-09-01");
    expect(paymentMonthFor("2026-01-31")).toBe("2026-01-01");
  });

  it("is not payable before the client has started", () => {
    const now = new Date("2026-08-14T00:00:00Z");
    expect(isBonusPayable("2026-09-01", now)).toBe(false);
    expect(isBonusPayable("2026-08-14", now)).toBe(true);
    expect(isBonusPayable("2026-07-01", now)).toBe(true);
  });

  it("is not payable without a start date, rather than assuming the best", () => {
    // An offer with no start date has not become a job yet.
    expect(isBonusPayable(null)).toBe(false);
    expect(isBonusPayable(undefined)).toBe(false);
    expect(isBonusPayable("not a date")).toBe(false);
    expect(paymentMonthFor(null)).toBeNull();
    expect(paymentMonthFor("nonsense")).toBeNull();
  });

  it("explains what a bonus is waiting on", () => {
    const now = new Date("2026-08-14T00:00:00Z");
    expect(payabilityNote(null, now)).toMatch(/confirmed start date/i);
    expect(payabilityNote("2026-09-01", now)).toMatch(/after the client starts/i);
    expect(payabilityNote("2026-07-01", now)).toContain("2026-07");
  });
});

describe("validateSettings", () => {
  it("accepts a sensible change", () => {
    const result = validateSettings({ placement_bonus_rate: 0.12 });
    expect(result.ok).toBe(true);
  });

  it("rejects a rate entered as a percentage by mistake", () => {
    // 10 meaning "10%" would pay a thousand percent of commission.
    const result = validateSettings({ placement_bonus_rate: 10 });
    expect(result.ok).toBe(false);
  });

  it("rejects a floor above the cap", () => {
    const result = validateSettings({
      placement_bonus_floor: 500_000,
      placement_bonus_cap: 100_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/minimum bonus cannot be above/i);
    }
  });

  it("reports every problem at once rather than the first", () => {
    const result = validateSettings({
      placement_bonus_rate: 99,
      usd_to_xaf: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1);
  });

  it("ignores keys that were not submitted", () => {
    const result = validateSettings({});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings).toEqual({});
  });
});

describe("withDefaults", () => {
  it("fills missing keys", () => {
    expect(withDefaults({ placement_bonus_rate: 0.15 })).toEqual({
      ...DEFAULT_INCENTIVE_SETTINGS,
      placement_bonus_rate: 0.15,
    });
  });

  it("ignores nulls and non-numbers stored in the database", () => {
    const merged = withDefaults({
      placement_bonus_rate: null as unknown as number,
      usd_to_xaf: "600" as unknown as number,
    });
    expect(merged).toEqual(DEFAULT_INCENTIVE_SETTINGS);
  });

  it("returns the defaults for no settings at all", () => {
    expect(withDefaults(null)).toEqual(DEFAULT_INCENTIVE_SETTINGS);
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
  });

  it("says when a bound was applied", () => {
    expect(explainPlacementBonus(computePlacementBonus({ commissionAmount: 10 }), 10)).toMatch(
      /minimum/i
    );
  });
});

describe("sumEarned", () => {
  it("keeps pending separate from earned", () => {
    expect(
      sumEarned([
        { amount: 75_000, status: "paid" },
        { amount: 30_000, status: "approved" },
        { amount: 2_000, status: "pending" },
        { amount: 99_000, status: "void" },
      ])
    ).toEqual({ paid: 75_000, approved: 30_000, pending: 2_000 });
  });

  it("handles an empty list", () => {
    expect(sumEarned([])).toEqual({ paid: 0, approved: 0, pending: 0 });
  });
});

describe("helpers", () => {
  it("no longer recognises the survival award", () => {
    expect(isAwardKind("first_interview")).toBe(true);
    expect(isAwardKind("placement_survival")).toBe(false);
  });

  it("defaults a missing assessment to the standard tier", () => {
    expect(tierFromAssessment(null)).toBe("standard");
    expect(
      tierFromAssessment({ computed_tier: "standard", override_tier: "very_hard" })
    ).toBe("very_hard");
  });
});
