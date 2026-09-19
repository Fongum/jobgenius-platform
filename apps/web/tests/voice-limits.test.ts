import { describe, it, expect } from "vitest";
import {
  DEFAULT_VOICE_DAILY_SESSIONS,
  TOKEN_SESSION_WINDOW_MS,
  VOICE_QUOTA_WINDOW_MS,
  evaluateVoiceQuota,
  getVoiceDailySessionCap,
  isSessionEligibleForToken,
  voiceQuotaMessage,
} from "@/lib/portal/voice-limits";

const NOW = new Date("2026-09-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("getVoiceDailySessionCap", () => {
  it("defaults when unset, blank, negative or non-numeric", () => {
    expect(getVoiceDailySessionCap(undefined)).toBe(DEFAULT_VOICE_DAILY_SESSIONS);
    expect(getVoiceDailySessionCap("  ")).toBe(DEFAULT_VOICE_DAILY_SESSIONS);
    expect(getVoiceDailySessionCap("-3")).toBe(DEFAULT_VOICE_DAILY_SESSIONS);
    expect(getVoiceDailySessionCap("lots")).toBe(DEFAULT_VOICE_DAILY_SESSIONS);
  });

  it("honours a configured value, floored, and 0 as paused", () => {
    expect(getVoiceDailySessionCap("4")).toBe(4);
    expect(getVoiceDailySessionCap("2.9")).toBe(2);
    expect(getVoiceDailySessionCap("0")).toBe(0);
  });
});

describe("evaluateVoiceQuota", () => {
  it("allows while under the cap and reports remaining slots after this one", () => {
    const verdict = evaluateVoiceQuota({
      sessionStarts: [hoursAgo(1), hoursAgo(2)],
      dailyCap: 5,
      now: NOW,
    });
    expect(verdict).toEqual({ allowed: true, remaining: 2 });
  });

  it("blocks at the cap and says when the oldest session frees a slot", () => {
    const verdict = evaluateVoiceQuota({
      sessionStarts: [hoursAgo(20), hoursAgo(5), hoursAgo(1)],
      dailyCap: 3,
      now: NOW,
    });
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    expect(verdict.reason).toBe("DAILY_CAP_REACHED");
    // Oldest (20h ago) leaves the 24h window in 4h.
    expect(verdict.retryAfterSeconds).toBe(4 * 3600);
  });

  it("ignores sessions older than the 24h window", () => {
    const verdict = evaluateVoiceQuota({
      sessionStarts: [hoursAgo(25), hoursAgo(30), hoursAgo(48)],
      dailyCap: 1,
      now: NOW,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("a session exactly 24h old no longer counts", () => {
    const verdict = evaluateVoiceQuota({
      sessionStarts: [new Date(NOW.getTime() - VOICE_QUOTA_WINDOW_MS)],
      dailyCap: 1,
      now: NOW,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("when over the cap (cap lowered), waits for enough sessions to age out", () => {
    // 4 sessions in window, cap now 2: need the 3rd-oldest... i.e. index len-cap = 2.
    const verdict = evaluateVoiceQuota({
      sessionStarts: [hoursAgo(23), hoursAgo(10), hoursAgo(5), hoursAgo(1)],
      dailyCap: 2,
      now: NOW,
    });
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    // Slot frees when the 5h-ago session leaves the window: 19h from now.
    expect(verdict.retryAfterSeconds).toBe(19 * 3600);
  });

  it("cap 0 means voice practice is paused", () => {
    const verdict = evaluateVoiceQuota({ sessionStarts: [], dailyCap: 0, now: NOW });
    expect(verdict).toMatchObject({ allowed: false, reason: "PAUSED" });
  });

  it("skips invalid dates instead of counting them", () => {
    const verdict = evaluateVoiceQuota({
      sessionStarts: [new Date("not-a-date"), hoursAgo(1)],
      dailyCap: 2,
      now: NOW,
    });
    expect(verdict).toEqual({ allowed: true, remaining: 0 });
  });
});

describe("isSessionEligibleForToken", () => {
  const started = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

  it("accepts a fresh in-progress session", () => {
    expect(
      isSessionEligibleForToken({ status: "in_progress", startedAt: started(30_000), now: NOW })
    ).toBe(true);
  });

  it("rejects stale sessions", () => {
    expect(
      isSessionEligibleForToken({
        status: "in_progress",
        startedAt: started(TOKEN_SESSION_WINDOW_MS + 1000),
        now: NOW,
      })
    ).toBe(false);
  });

  it("rejects completed / not_started sessions", () => {
    for (const status of ["completed", "not_started", null, undefined]) {
      expect(isSessionEligibleForToken({ status, startedAt: started(1000), now: NOW })).toBe(false);
    }
  });

  it("rejects missing, invalid or future start times", () => {
    expect(isSessionEligibleForToken({ status: "in_progress", startedAt: null, now: NOW })).toBe(false);
    expect(isSessionEligibleForToken({ status: "in_progress", startedAt: "garbage", now: NOW })).toBe(false);
    expect(
      isSessionEligibleForToken({ status: "in_progress", startedAt: started(-60_000), now: NOW })
    ).toBe(false);
  });
});

describe("voiceQuotaMessage", () => {
  it("points seekers at the text practice that still works", () => {
    const msg = voiceQuotaMessage({
      allowed: false,
      reason: "DAILY_CAP_REACHED",
      retryAfterSeconds: 90 * 60,
    });
    expect(msg).toContain("2 hours");
    expect(msg).toMatch(/Q&A/);
  });

  it("uses a distinct message when paused", () => {
    expect(
      voiceQuotaMessage({ allowed: false, reason: "PAUSED", retryAfterSeconds: 0 })
    ).toMatch(/unavailable/);
  });
});
