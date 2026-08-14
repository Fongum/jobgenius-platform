import { describe, it, expect } from "vitest";
import { interviewHappened } from "@/lib/interview-milestones";

const NOW = new Date("2026-08-14T12:00:00Z");

describe("interviewHappened", () => {
  it("accepts a completed interview whatever the case", () => {
    // The two write paths disagree: one stores "completed", the other
    // "COMPLETED". A milestone that silently never fires is worse than a
    // tolerant check.
    for (const status of ["completed", "COMPLETED", "Completed", " completed "]) {
      expect(interviewHappened({ status }, NOW)).toBe(true);
    }
  });

  it("counts a confirmed interview only once its time has passed", () => {
    expect(
      interviewHappened(
        { status: "confirmed", scheduled_at: "2026-08-13T10:00:00Z" },
        NOW
      )
    ).toBe(true);

    expect(
      interviewHappened(
        { status: "confirmed", scheduled_at: "2026-08-20T10:00:00Z" },
        NOW
      )
    ).toBe(false);
  });

  it("does not count a confirmed interview with no time set", () => {
    expect(interviewHappened({ status: "confirmed" }, NOW)).toBe(false);
    expect(
      interviewHappened({ status: "confirmed", scheduled_at: null }, NOW)
    ).toBe(false);
  });

  it("ignores interviews that never took place", () => {
    for (const status of ["pending_candidate", "cancelled", "no_show", "SCHEDULED"]) {
      expect(
        interviewHappened({ status, scheduled_at: "2026-01-01T10:00:00Z" }, NOW)
      ).toBe(false);
    }
  });

  it("ignores a missing or unparseable status", () => {
    expect(interviewHappened({}, NOW)).toBe(false);
    expect(interviewHappened({ status: null }, NOW)).toBe(false);
    expect(interviewHappened({ status: "" }, NOW)).toBe(false);
  });

  it("ignores an unparseable scheduled time rather than paying on it", () => {
    expect(
      interviewHappened({ status: "confirmed", scheduled_at: "not a date" }, NOW)
    ).toBe(false);
  });

  it("treats a completed interview as happened even without a time", () => {
    // Somebody recorded the outcome; that is stronger evidence than the
    // calendar.
    expect(interviewHappened({ status: "completed", scheduled_at: null }, NOW)).toBe(
      true
    );
  });
});
