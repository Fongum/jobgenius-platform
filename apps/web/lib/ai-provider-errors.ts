// ============================================================
// AI provider outage handling for background jobs.
//
// Production incident (Aug–Sep 2026): the OpenAI account ran out of credits.
// Every AI-dependent job failed with "429 You have no credits remaining",
// burned its 3 attempts in a few minutes, and then permanently parked its
// queue item in NEEDS_ATTENTION as if the *item* were broken. 84 items were
// stranded that way, nothing alerted, and nothing retried once credits were
// restored.
//
// A quota outage is a property of the platform, not of the item. So:
//   - it is detected separately from ordinary failures,
//   - the job is deferred (long delay, attempt NOT consumed) instead of failed,
//   - deferral is bounded, so a permanently dead key still surfaces eventually.
//
// Pure functions: no Supabase/OpenAI imports, so the policy is unit-tested.
// ============================================================

/**
 * Substrings (case-insensitive) that identify an exhausted-credit / quota error.
 * Shared with the requeue route so its SQL filter cannot drift from detection.
 */
export const AI_QUOTA_ERROR_TERMS = [
  "no credits remaining",
  "insufficient_quota",
  "exceeded your current quota",
  "credit balance is too low",
  "billing_hard_limit",
] as const;

export type AiProviderErrorKind = "quota" | "rate_limit" | "unavailable";

function messageOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const record = input as { message?: unknown; code?: unknown; type?: unknown };
    return [record.message, record.code, record.type]
      .filter((v): v is string => typeof v === "string")
      .join(" ");
  }
  return "";
}

/** Classify a thrown value or stored last_error string; null if it is not a provider outage. */
export function classifyAiProviderError(input: unknown): AiProviderErrorKind | null {
  const text = messageOf(input).toLowerCase();
  if (!text) return null;

  if (AI_QUOTA_ERROR_TERMS.some((term) => text.includes(term))) return "quota";

  // A bare 429 that is not a quota message is an ordinary, short-lived rate limit.
  if (/\b429\b/.test(text) || text.includes("rate limit")) return "rate_limit";

  if (/\b(500|502|503|504)\b/.test(text) || text.includes("overloaded")) return "unavailable";

  return null;
}

export function isAiQuotaError(input: unknown): boolean {
  return classifyAiProviderError(input) === "quota";
}

// ─── Job failure policy ──────────────────────────────────────

export const RETRY_BASE_MS = 60 * 1000;
export const RETRY_MAX_MS = 30 * 60 * 1000;
/** How long a quota-blocked job waits between attempts. */
export const QUOTA_DEFER_MS = 30 * 60 * 1000;
/** After this long (from job creation) a quota-blocked job stops deferring and fails normally. */
export const QUOTA_DEFER_MAX_MS = 72 * 60 * 60 * 1000;

export type JobFailureDecision = {
  status: "RETRY" | "FAILED";
  /** Value to store in background_jobs.attempts. */
  attempts: number;
  /** Delay before the next run (RETRY only). */
  delayMs: number;
  reason: "backoff" | "exhausted" | "quota_deferral";
};

export function decideJobFailure(input: {
  error: unknown;
  attempts: number | null | undefined;
  maxAttempts: number | null | undefined;
  /** Milliseconds since the job was created; unknown (null) disables quota deferral. */
  jobAgeMs: number | null;
}): JobFailureDecision {
  const previous = input.attempts ?? 0;
  const max = input.maxAttempts ?? 3;

  if (
    isAiQuotaError(input.error) &&
    input.jobAgeMs !== null &&
    input.jobAgeMs < QUOTA_DEFER_MAX_MS
  ) {
    // Do not consume an attempt: the item did nothing wrong.
    return {
      status: "RETRY",
      attempts: previous,
      delayMs: QUOTA_DEFER_MS,
      reason: "quota_deferral",
    };
  }

  const attempts = previous + 1;
  if (attempts < max) {
    return {
      status: "RETRY",
      attempts,
      delayMs: Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS),
      reason: "backoff",
    };
  }

  return { status: "FAILED", attempts, delayMs: 0, reason: "exhausted" };
}
