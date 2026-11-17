import { describe, expect, it } from "vitest";
import { computeInterviewGuarantee } from "@/lib/interview-guarantee";
import { generateCollaborationAgreementHTML } from "@/lib/collaboration-agreement";

const activatedAt = "2026-12-01T12:00:00Z";
const day = (n: number) => new Date(new Date(activatedAt).getTime() + n * 86_400_000);

describe("computeInterviewGuarantee", () => {
  it("does not apply to Recurring or an unset plan", () => {
    expect(computeInterviewGuarantee({ tier: "recurring", activatedAt, interviews: [] }).state).toBe("not_applicable");
    expect(computeInterviewGuarantee({ tier: null, activatedAt, interviews: [] }).state).toBe("not_applicable");
  });

  it("waits for activation (setup fee paid)", () => {
    expect(computeInterviewGuarantee({ tier: "essentials", activatedAt: null, interviews: [] }).state).toBe("not_activated");
  });

  it("is on track early, at risk in the last 21 days, triggered at day 90", () => {
    const base = { tier: "premium", activatedAt, interviews: [] };
    expect(computeInterviewGuarantee({ ...base, now: day(10) }).state).toBe("on_track");
    expect(computeInterviewGuarantee({ ...base, now: day(70) }).state).toBe("at_risk");
    const t = computeInterviewGuarantee({ ...base, now: day(90) });
    expect(t.state).toBe("triggered");
    expect(t.guaranteeDate).toBe("2027-03-01");
  });

  it("is met by any non-cancelled interview after activation, attended or not", () => {
    const s = computeInterviewGuarantee({
      tier: "essentials",
      activatedAt,
      interviews: [{ scheduled_at: day(40).toISOString(), status: "no_show" }],
      now: day(120),
    });
    expect(s.state).toBe("met");
  });

  it("ignores cancelled interviews and ones before activation", () => {
    const s = computeInterviewGuarantee({
      tier: "essentials",
      activatedAt,
      interviews: [
        { scheduled_at: day(-5).toISOString(), status: "completed" },
        { scheduled_at: day(30).toISOString(), status: "cancelled" },
      ],
      now: day(95),
    });
    expect(s.state).toBe("triggered");
  });
});

describe("agreement wording", () => {
  const client = { clientName: "Ada Client", clientEmail: "ada@example.com" };

  it("Essentials/Premium include the Interview Guarantee with remedy and no count", () => {
    const html = generateCollaborationAgreementHTML({ ...client, campaignTier: "premium", setupFeeUsd: 800 });
    expect(html).toContain("Interview Guarantee (Essentials and Premium plans)");
    expect(html).toContain("ninety (90) days after Campaign Activation");
    expect(html).toContain("continue providing the services of Client's plan");
    expect(html).toContain("does not make the Campaign Setup & Execution Fee refundable");
    expect(html).toContain("Except for this Interview Guarantee, JobGenius does not guarantee interviews");
    expect(html).not.toContain("<p>JobGenius does not guarantee interviews");
  });

  it("Recurring keeps the plain no-guarantee sentence", () => {
    const html = generateCollaborationAgreementHTML({ ...client, campaignTier: "recurring" });
    expect(html).not.toContain("Interview Guarantee");
    expect(html).toContain("<p>JobGenius does not guarantee interviews, job offers");
  });
});
