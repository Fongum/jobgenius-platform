import { describe, it, expect } from "vitest";
import {
  AGING_STATUSES,
  DEFAULT_PAYMENT_SLA_DAYS,
  DEFAULT_REVIEW_SLA_DAYS,
  daysWaiting,
  getIntakeSla,
  intakeAlertsFrom,
  intakeWaiting,
  summarizeIntakeAging,
  waitingBadge,
} from "@/lib/intake-aging";

const NOW = new Date("2026-09-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const SLA = { review: 3, payment: 7 };

describe("getIntakeSla", () => {
  it("defaults to 3 days for review and 7 for payment", () => {
    expect(getIntakeSla({})).toEqual({ review: DEFAULT_REVIEW_SLA_DAYS, payment: DEFAULT_PAYMENT_SLA_DAYS });
  });

  it("honours env overrides and rejects junk", () => {
    expect(getIntakeSla({ INTAKE_REVIEW_SLA_DAYS: "5", INTAKE_PAYMENT_SLA_DAYS: "14" })).toEqual({ review: 5, payment: 14 });
    for (const bad of ["0", "-2", "abc", "", "  "]) {
      expect(getIntakeSla({ INTAKE_REVIEW_SLA_DAYS: bad })).toEqual({ review: 3, payment: 7 });
    }
  });
});

describe("intakeWaiting", () => {
  it("puts submitted / pending_review / call_completed in the review queue and payment-pending in payment", () => {
    for (const status of ["submitted", "pending_review", "call_completed"]) {
      expect(intakeWaiting({ status, submitted_at: daysAgo(5) })?.scope).toBe("review");
    }
    expect(intakeWaiting({ status: "approved_payment_pending", approved_at: daysAgo(5) })?.scope).toBe("payment");
  });

  it("ignores statuses that are not waiting on us", () => {
    for (const status of ["draft", "waitlisted", "approved_preview", "preview_active", "preview_expired", "active_client", "rejected"]) {
      expect(intakeWaiting({ status, submitted_at: daysAgo(50), created_at: daysAgo(50) })).toBeNull();
    }
  });

  it("measures each queue from the right timestamp, with fallbacks", () => {
    expect(intakeWaiting({ status: "pending_review", submitted_at: daysAgo(10), created_at: daysAgo(30) })?.since.toISOString()).toBe(daysAgo(10));
    expect(intakeWaiting({ status: "pending_review", submitted_at: null, created_at: daysAgo(30) })?.since.toISOString()).toBe(daysAgo(30));
    expect(intakeWaiting({ status: "call_completed", call_completed_at: daysAgo(2), submitted_at: daysAgo(20) })?.since.toISOString()).toBe(daysAgo(2));
    expect(intakeWaiting({ status: "approved_payment_pending", approved_at: null, updated_at: daysAgo(116) })?.since.toISOString()).toBe(daysAgo(116));
  });

  it("returns null when no usable timestamp exists", () => {
    expect(intakeWaiting({ status: "pending_review" })).toBeNull();
    expect(intakeWaiting({ status: "pending_review", submitted_at: "not-a-date" })).toBeNull();
  });
});

describe("daysWaiting", () => {
  it("floors to whole days and never goes negative", () => {
    expect(daysWaiting(new Date(daysAgo(3.9)), NOW)).toBe(3);
    expect(daysWaiting(new Date(daysAgo(0.2)), NOW)).toBe(0);
    expect(daysWaiting(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(0);
  });
});

describe("summarizeIntakeAging", () => {
  // The production picture on 2026-09-19: 7 pending review (11-55d), 5 payment-pending (116d).
  const production = [
    ...[11, 20, 39, 39, 40, 50, 55].map((d) => ({ status: "pending_review", submitted_at: daysAgo(d) })),
    ...Array.from({ length: 5 }, () => ({ status: "approved_payment_pending", approved_at: daysAgo(116) })),
    { status: "active_client", submitted_at: daysAgo(81) },
    { status: "rejected", submitted_at: daysAgo(87) },
  ];

  it("summarises the real backlog", () => {
    const s = summarizeIntakeAging(production, NOW, SLA);
    expect(s.review).toEqual({ waiting: 7, overdue: 7, oldestDays: 55, slaDays: 3 });
    expect(s.payment).toEqual({ waiting: 5, overdue: 5, oldestDays: 116, slaDays: 7 });
  });

  it("treats exactly-on-target as on time and one day over as overdue", () => {
    const s = summarizeIntakeAging(
      [
        { status: "pending_review", submitted_at: daysAgo(3) },
        { status: "pending_review", submitted_at: daysAgo(4) },
      ],
      NOW,
      SLA
    );
    expect(s.review).toMatchObject({ waiting: 2, overdue: 1 });
  });

  it("is all zeros for an empty or fully on-target queue", () => {
    expect(summarizeIntakeAging([], NOW, SLA).review).toMatchObject({ waiting: 0, overdue: 0, oldestDays: 0 });
    expect(summarizeIntakeAging([{ status: "pending_review", submitted_at: daysAgo(1) }], NOW, SLA).review.overdue).toBe(0);
  });
});

describe("intakeAlertsFrom", () => {
  it("raises one alert per overdue queue, and none when everything is on target", () => {
    const onTarget = summarizeIntakeAging([{ status: "pending_review", submitted_at: daysAgo(1) }], NOW, SLA);
    expect(intakeAlertsFrom(onTarget)).toEqual([]);

    const both = summarizeIntakeAging(
      [
        { status: "pending_review", submitted_at: daysAgo(5) },
        { status: "approved_payment_pending", approved_at: daysAgo(9) },
      ],
      NOW,
      SLA
    );
    const alerts = intakeAlertsFrom(both);
    expect(alerts.map((a) => a.meta.scope)).toEqual(["review", "payment"]);
    expect(alerts.every((a) => a.type === "INTAKE_OVERDUE")).toBe(true);
  });

  it("escalates to HIGH only when the oldest item is over 3x the target", () => {
    const at = (days: number) => intakeAlertsFrom(summarizeIntakeAging([{ status: "pending_review", submitted_at: daysAgo(days) }], NOW, SLA))[0];
    expect(at(9).severity).toBe("MEDIUM"); // 9 = 3x, not over
    expect(at(10).severity).toBe("HIGH");
  });

  it("writes a readable message with correct pluralisation", () => {
    const one = intakeAlertsFrom(summarizeIntakeAging([{ status: "pending_review", submitted_at: daysAgo(5) }], NOW, SLA))[0];
    expect(one.message).toBe("1 seeker awaiting intake review for more than 3 days (oldest: 5 days).");
    const many = intakeAlertsFrom(
      summarizeIntakeAging(Array.from({ length: 5 }, () => ({ status: "approved_payment_pending", approved_at: daysAgo(116) })), NOW, SLA)
    )[0];
    expect(many.message).toBe("5 seekers approved and awaiting payment for more than 7 days (oldest: 116 days).");
    expect(many.meta).toMatchObject({ scope: "payment", overdue: 5, waiting: 5, oldest_days: 116, sla_days: 7 });
  });
});

describe("waitingBadge", () => {
  it("labels and flags overdue rows", () => {
    expect(waitingBadge({ status: "pending_review", submitted_at: daysAgo(39) }, NOW, SLA)).toEqual({ label: "Waiting 39d for review", overdue: true });
    expect(waitingBadge({ status: "approved_payment_pending", approved_at: daysAgo(2) }, NOW, SLA)).toEqual({ label: "Waiting 2d for payment", overdue: false });
    expect(waitingBadge({ status: "pending_review", submitted_at: daysAgo(0) }, NOW, SLA)).toEqual({ label: "Waiting today for review", overdue: false });
  });

  it("is null for statuses that are not waiting on us", () => {
    expect(waitingBadge({ status: "active_client", submitted_at: daysAgo(81) }, NOW, SLA)).toBeNull();
  });
});

describe("AGING_STATUSES", () => {
  it("is exactly the statuses that intakeWaiting treats as waiting", () => {
    for (const status of AGING_STATUSES) expect(intakeWaiting({ status, created_at: daysAgo(1) })).not.toBeNull();
  });
});
