import { describe, it, expect } from "vitest";
import {
  DORMANT_AFTER_DAYS,
  HIGH_TOUCH_SURCHARGE,
  STAGE_WEIGHTS,
  canAbsorb,
  computeAmLoad,
  deriveStage,
  nextAssignee,
  weightFor,
  type ClientLoadInput,
  type ClientStage,
} from "@/lib/client-load";

function clients(...stages: ClientStage[]): ClientLoadInput[] {
  return stages.map((stage, i) => ({ job_seeker_id: `s-${i}`, stage }));
}

describe("weightFor", () => {
  it("weights interviewing above applying", () => {
    expect(STAGE_WEIGHTS.interviewing).toBeGreaterThan(STAGE_WEIGHTS.applying);
  });

  it("adds the surcharge only for a confirmed high-touch client", () => {
    const plain = weightFor({ job_seeker_id: "a", stage: "applying" });
    const heavy = weightFor({
      job_seeker_id: "a",
      stage: "applying",
      high_touch: true,
    });
    expect(heavy - plain).toBe(HIGH_TOUCH_SURCHARGE);
  });
});

describe("computeAmLoad", () => {
  it("shows three heavy clients outweighing five light ones", () => {
    // The exact case that motivated this: headcount says the opposite.
    const heavy = computeAmLoad(
      "am-1",
      "Three clients",
      clients("applying", "interviewing", "interviewing")
    );
    const light = computeAmLoad(
      "am-2",
      "Five clients",
      clients("applying", "applying", "applying", "applying", "applying")
    );

    expect(heavy.headcount).toBeLessThan(light.headcount);
    expect(heavy.load).toBeGreaterThan(light.load);
    expect(heavy.load).toBe(7);
    expect(light.load).toBe(5);
  });

  it("counts clients per stage", () => {
    const load = computeAmLoad(
      "am-1",
      "Ada",
      clients("onboarding", "applying", "applying", "offer")
    );
    expect(load.byStage.applying).toBe(2);
    expect(load.byStage.offer).toBe(1);
    expect(load.byStage.dormant).toBe(0);
  });

  it("reports utilisation against capacity, null when unset", () => {
    const withCap = computeAmLoad("am-1", "Ada", clients("applying", "applying"), 5);
    expect(withCap.utilisation).toBe(0.4);

    const without = computeAmLoad("am-1", "Ada", clients("applying"), null);
    expect(without.utilisation).toBeNull();
  });

  it("handles an AM with no clients", () => {
    const empty = computeAmLoad("am-1", "Ada", [], 5);
    expect(empty.load).toBe(0);
    expect(empty.headcount).toBe(0);
    expect(empty.utilisation).toBe(0);
  });
});

describe("canAbsorb", () => {
  it("accounts for the weight of the incoming client, not just the count", () => {
    // 4.0 of 5.0 used. Headcount says "room for one more"; a new client
    // arrives at onboarding weight 2.0, which does not fit.
    const load = computeAmLoad("am-1", "Ada", clients("applying", "onboarding"), 5);
    expect(load.load).toBe(3);
    expect(canAbsorb(load, "onboarding")).toBe(true);

    const fuller = computeAmLoad(
      "am-1",
      "Ada",
      clients("interviewing", "applying"),
      5
    );
    expect(fuller.load).toBe(4);
    expect(canAbsorb(fuller, "onboarding")).toBe(false);
  });

  it("treats an AM with no capacity set as always able to absorb", () => {
    const load = computeAmLoad("am-1", "Ada", clients("interviewing"), null);
    expect(canAbsorb(load)).toBe(true);
  });
});

describe("nextAssignee", () => {
  it("picks the lowest load, not the lowest headcount", () => {
    const busy3 = computeAmLoad("busy", "Busy", clients("interviewing", "interviewing"), 10);
    const light5 = computeAmLoad(
      "light",
      "Light",
      clients("applying", "applying", "applying"),
      10
    );

    expect(busy3.headcount).toBeLessThan(light5.headcount);
    expect(nextAssignee([busy3, light5])?.account_manager_id).toBe("light");
  });

  it("returns null when nobody has room", () => {
    const full = computeAmLoad("am-1", "Ada", clients("interviewing", "interviewing"), 6);
    expect(nextAssignee([full], "onboarding")).toBeNull();
  });

  it("breaks a load tie on headcount", () => {
    // Equal load, but the one with more clients is closer to a stage
    // change tipping them over.
    const few = computeAmLoad("few", "Few", clients("interviewing"), 10);
    const many = computeAmLoad("many", "Many", clients("applying", "applying", "applying"), 10);

    expect(few.load).toBe(many.load);
    expect(nextAssignee([many, few])?.account_manager_id).toBe("few");
  });
});

describe("deriveStage", () => {
  it("ranks an offer above everything else", () => {
    expect(
      deriveStage({ hasOpenOffer: true, upcomingInterviews: 3, daysSinceActivity: 90 })
    ).toBe("offer");
  });

  it("does not call someone dormant when they have an interview coming", () => {
    expect(
      deriveStage({ upcomingInterviews: 1, daysSinceActivity: DORMANT_AFTER_DAYS + 30 })
    ).toBe("interviewing");
  });

  it("marks a quiet client dormant", () => {
    expect(deriveStage({ daysSinceActivity: DORMANT_AFTER_DAYS })).toBe("dormant");
  });

  it("treats a brand new client as onboarding", () => {
    expect(deriveStage({ daysSinceOnboarded: 3, daysSinceActivity: 1 })).toBe(
      "onboarding"
    );
  });

  it("falls back to applying once onboarding has passed", () => {
    expect(deriveStage({ daysSinceOnboarded: 60, daysSinceActivity: 2 })).toBe(
      "applying"
    );
  });

  it("does not treat missing evidence as dormancy", () => {
    // Unknown activity must not silently downgrade someone to 0.5 weight.
    expect(deriveStage({})).toBe("applying");
    expect(deriveStage({ daysSinceActivity: null })).toBe("applying");
  });
});
