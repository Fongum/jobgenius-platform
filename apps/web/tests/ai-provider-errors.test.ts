import { describe, it, expect } from "vitest";
import {
  AI_QUOTA_ERROR_TERMS,
  QUOTA_DEFER_MAX_MS,
  QUOTA_DEFER_MS,
  RETRY_MAX_MS,
  classifyAiProviderError,
  decideJobFailure,
  isAiQuotaError,
} from "@/lib/ai-provider-errors";

// The exact text stored in production application_queue.last_error (84 rows).
const PROD_QUOTA_ERROR =
  "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";

describe("classifyAiProviderError", () => {
  it("recognises the production out-of-credits message", () => {
    expect(classifyAiProviderError(PROD_QUOTA_ERROR)).toBe("quota");
    expect(classifyAiProviderError(new Error(PROD_QUOTA_ERROR))).toBe("quota");
  });

  it.each([
    "You exceeded your current quota, please check your plan and billing details.",
    "Error code: insufficient_quota",
    "Your credit balance is too low to access the API",
    "billing_hard_limit_reached",
  ])("recognises other quota phrasings: %s", (msg) => {
    expect(classifyAiProviderError(msg)).toBe("quota");
  });

  it("recognises SDK-style error objects by code/type as well as message", () => {
    expect(classifyAiProviderError({ message: "429", code: "insufficient_quota" })).toBe("quota");
    expect(classifyAiProviderError({ message: "boom", type: "insufficient_quota" })).toBe("quota");
  });

  it("is case-insensitive", () => {
    expect(isAiQuotaError("YOU HAVE NO CREDITS REMAINING")).toBe(true);
  });

  it("treats an ordinary 429 as a short-lived rate limit, not a quota outage", () => {
    expect(classifyAiProviderError("429 Rate limit reached for gpt-4o-mini in org")).toBe("rate_limit");
    expect(isAiQuotaError("429 Rate limit reached for gpt-4o-mini")).toBe(false);
  });

  it("flags provider 5xx / overload as unavailable", () => {
    expect(classifyAiProviderError("503 Service Unavailable")).toBe("unavailable");
    expect(classifyAiProviderError("The model is overloaded")).toBe("unavailable");
  });

  it("returns null for unrelated errors and empty input", () => {
    for (const input of ["Resume text missing", "Job post not found.", "", null, undefined, 42, {}]) {
      expect(classifyAiProviderError(input)).toBeNull();
    }
  });

  it("keeps the shared term list non-empty and lowercase (used in a SQL ilike filter)", () => {
    expect(AI_QUOTA_ERROR_TERMS.length).toBeGreaterThan(0);
    for (const term of AI_QUOTA_ERROR_TERMS) {
      expect(term).toBe(term.toLowerCase());
      expect(term).not.toMatch(/[,()*%]/); // would break the PostgREST or() filter
    }
  });
});

describe("decideJobFailure", () => {
  const fresh = 60 * 60 * 1000; // job created 1h ago

  it("defers a quota failure without consuming an attempt", () => {
    const d = decideJobFailure({ error: PROD_QUOTA_ERROR, attempts: 2, maxAttempts: 3, jobAgeMs: fresh });
    expect(d).toEqual({ status: "RETRY", attempts: 2, delayMs: QUOTA_DEFER_MS, reason: "quota_deferral" });
  });

  it("would previously have failed this job; a quota error on the LAST attempt still defers", () => {
    const d = decideJobFailure({ error: PROD_QUOTA_ERROR, attempts: 2, maxAttempts: 3, jobAgeMs: fresh });
    expect(d.status).toBe("RETRY");
  });

  it("stops deferring after the window so a permanently dead key still surfaces", () => {
    const d = decideJobFailure({
      error: PROD_QUOTA_ERROR,
      attempts: 2,
      maxAttempts: 3,
      jobAgeMs: QUOTA_DEFER_MAX_MS + 1,
    });
    expect(d).toMatchObject({ status: "FAILED", reason: "exhausted", attempts: 3 });
  });

  it("does not defer when the job age is unknown", () => {
    const d = decideJobFailure({ error: PROD_QUOTA_ERROR, attempts: 0, maxAttempts: 3, jobAgeMs: null });
    expect(d.reason).toBe("backoff");
  });

  it("keeps the original exponential backoff for ordinary failures", () => {
    const first = decideJobFailure({ error: "boom", attempts: 0, maxAttempts: 3, jobAgeMs: fresh });
    expect(first).toEqual({ status: "RETRY", attempts: 1, delayMs: 60_000, reason: "backoff" });
    const second = decideJobFailure({ error: "boom", attempts: 1, maxAttempts: 3, jobAgeMs: fresh });
    expect(second).toEqual({ status: "RETRY", attempts: 2, delayMs: 120_000, reason: "backoff" });
  });

  it("fails an ordinary error on the final attempt", () => {
    const d = decideJobFailure({ error: "boom", attempts: 2, maxAttempts: 3, jobAgeMs: fresh });
    expect(d).toMatchObject({ status: "FAILED", attempts: 3, reason: "exhausted" });
  });

  it("caps the backoff delay", () => {
    const d = decideJobFailure({ error: "boom", attempts: 9, maxAttempts: 50, jobAgeMs: fresh });
    expect(d.delayMs).toBe(RETRY_MAX_MS);
  });

  it("treats an ordinary rate-limit 429 like any other failure (normal backoff)", () => {
    const d = decideJobFailure({ error: "429 Rate limit reached", attempts: 0, maxAttempts: 3, jobAgeMs: fresh });
    expect(d.reason).toBe("backoff");
  });

  it("defaults missing attempts/max to 0 and 3", () => {
    const d = decideJobFailure({ error: "boom", attempts: null, maxAttempts: undefined, jobAgeMs: fresh });
    expect(d).toMatchObject({ status: "RETRY", attempts: 1 });
  });
});
