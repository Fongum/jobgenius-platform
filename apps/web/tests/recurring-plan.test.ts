import { describe, expect, it } from "vitest";
import {
  RECURRING_PLAN,
  isCampaignTier,
  successFeeRateForTier,
} from "@/app/components/homepage/marketingContent";
import { computePlacementFee, formatFeeRate } from "@/lib/billing/commission";
import { generateCollaborationAgreementHTML } from "@/lib/collaboration-agreement";

const client = { clientName: "Ada Client", clientEmail: "ada@example.com" };

describe("Recurring plan definition", () => {
  it("is $150/month with a 3.5% success fee", () => {
    expect(RECURRING_PLAN.monthlyFeeUsd).toBe(150);
    expect(successFeeRateForTier("recurring")).toBe(0.035);
  });

  it("keeps 5% for Essentials, Premium and unknown tiers", () => {
    expect(successFeeRateForTier("essentials")).toBe(0.05);
    expect(successFeeRateForTier("premium")).toBe(0.05);
    expect(successFeeRateForTier(null)).toBe(0.05);
  });

  it("recognises only the three tiers", () => {
    expect(isCampaignTier("recurring")).toBe(true);
    expect(isCampaignTier("standard")).toBe(false);
    expect(isCampaignTier(undefined)).toBe(false);
  });
});

describe("placement fee rate", () => {
  it("applies 3.5% for Recurring", () => {
    const fee = computePlacementFee({
      baseSalary: 100_000,
      guaranteedCompensation: 10_000,
      offerAcceptedAt: "2026-12-01",
      rate: 0.035,
    });
    expect(fee.commissionAmount).toBe(3_850);
    expect(fee.rate).toBe(0.035);
  });

  it("defaults to 5% when no rate is recorded", () => {
    const fee = computePlacementFee({ baseSalary: 50_000, offerAcceptedAt: "2026-12-01", rate: null });
    expect(fee.commissionAmount).toBe(2_500);
  });

  it("formats rates", () => {
    expect(formatFeeRate(0.035)).toBe("3.5%");
    expect(formatFeeRate(0.05)).toBe("5%");
  });
});

describe("Collaboration Agreement for Recurring", () => {
  const html = generateCollaborationAgreementHTML({ ...client, campaignTier: "recurring", monthlyFeeUsd: 150 });

  it("states the monthly fee and no setup fee", () => {
    expect(html).toContain("Monthly Subscription Fee");
    expect(html).toContain("$150 per month");
    expect(html).toContain("has no Campaign Setup & Execution Fee");
    expect(html).not.toContain("one-time, non-refundable");
  });

  it("uses 3.5% and covers each accepted placement", () => {
    expect(html).toContain("<strong>3.5% of the Client");
    expect(html).toContain("applies to each Accepted Placement");
  });

  it("lets the client stop anytime but keeps the 12-month fee tail", () => {
    expect(html).toContain("stop the subscription at any time by written notice");
    expect(html).toContain("within twelve (12) months after termination");
  });

  it("keeps the success-fee clock on the start date", () => {
    expect(html).toContain("within two (2) months after Client's employment start date");
  });
});

describe("Collaboration Agreement before a plan is chosen", () => {
  it("shows both setup fees with dollar signs", () => {
    const html = generateCollaborationAgreementHTML({
      ...client,
      effectiveDate: "2027-01-10T12:00:00Z",
    });
    expect(html).toMatch(/\$\d[\d,]* \(Essentials plan\) or \$\d[\d,]* \(Premium plan\)/);
  });
});

describe("Collaboration Agreement for Essentials is unchanged", () => {
  const html = generateCollaborationAgreementHTML({ ...client, campaignTier: "essentials", setupFeeUsd: 400 });

  it("keeps the one-time setup fee and 5%", () => {
    expect(html).toContain("one-time, non-refundable Campaign Setup & Execution Fee");
    expect(html).toContain("$400 (Essentials plan)");
    expect(html).toContain("<strong>5% of the Client");
    expect(html).not.toContain("Monthly Subscription Fee");
  });
});
