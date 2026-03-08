/**
 * Smart Retry with Failure Learning
 *
 * Analyzes failure reasons and chooses an appropriate retry strategy
 * instead of blindly retrying the same approach.
 */

import { supabaseServer } from "@/lib/supabase/server";

export type RetryStrategy =
  | "same"              // Retry with same approach (transient error)
  | "skip_optional"     // Skip optional fields that may have caused issues
  | "alt_resume"        // Use a different resume version
  | "simplified_fields" // Fill only required fields, skip nice-to-haves
  | "different_session"; // Use a fresh browser session

type StrategyResult = {
  strategy: RetryStrategy;
  changes: Record<string, unknown>;
  reason: string;
};

/**
 * Determine the best retry strategy based on failure context
 */
export function determineRetryStrategy(input: {
  errorCode?: string | null;
  lastError?: string | null;
  failedStep?: string | null;
  atsType?: string | null;
  attemptNumber: number;
  previousStrategies?: string[];
}): StrategyResult {
  const { errorCode, lastError, failedStep, attemptNumber, previousStrategies = [] } = input;
  const error = `${errorCode ?? ""} ${lastError ?? ""}`.toLowerCase();

  // Session/auth failures → fresh session
  if (error.includes("session") || error.includes("login") || error.includes("auth") ||
      error.includes("cookie") || error.includes("expired") || error.includes("401")) {
    return {
      strategy: "different_session",
      changes: { clear_storage_state: true, force_new_session: true },
      reason: "Session or authentication failure detected",
    };
  }

  // CAPTCHA → different session (different IP/fingerprint)
  if (error.includes("captcha") || error.includes("blocked") || error.includes("bot")) {
    return {
      strategy: "different_session",
      changes: { clear_storage_state: true, rotate_proxy: true },
      reason: "CAPTCHA or bot detection — try fresh session",
    };
  }

  // Required field validation failures → simplify
  if (error.includes("required") || error.includes("validation") ||
      error.includes("missing") || failedStep === "FILL_FORM") {
    if (!previousStrategies.includes("skip_optional")) {
      return {
        strategy: "skip_optional",
        changes: { skip_optional_fields: true, fill_only_required: true },
        reason: "Form validation failure — skip optional fields",
      };
    }
    return {
      strategy: "simplified_fields",
      changes: { minimal_fields_only: true, skip_cover_letter: true },
      reason: "Still failing after skip_optional — use minimal fields",
    };
  }

  // Upload failures → try alt resume
  if (error.includes("upload") || error.includes("resume") || error.includes("file") ||
      failedStep === "UPLOAD_RESUME") {
    return {
      strategy: "alt_resume",
      changes: { use_base_resume: true, skip_tailored: true },
      reason: "Resume upload issue — try base resume",
    };
  }

  // Timeout → simplified approach
  if (error.includes("timeout") || error.includes("timed out") || error.includes("navigation")) {
    return {
      strategy: "simplified_fields",
      changes: { reduce_wait_times: true, skip_optional_fields: true },
      reason: "Timeout — simplify to reduce form time",
    };
  }

  // Default: escalate strategy by attempt number
  const escalation: RetryStrategy[] = ["same", "skip_optional", "simplified_fields", "different_session"];
  const idx = Math.min(attemptNumber - 1, escalation.length - 1);

  return {
    strategy: escalation[idx],
    changes: {},
    reason: `Attempt ${attemptNumber} — escalating strategy`,
  };
}

/**
 * Record a retry strategy for tracking
 */
export async function recordRetryStrategy(
  runId: string,
  attemptNumber: number,
  strategy: RetryStrategy,
  changes: Record<string, unknown>
) {
  await supabaseServer.from("retry_strategies").insert({
    run_id: runId,
    attempt_number: attemptNumber,
    strategy,
    changes_applied: changes,
    outcome: "pending",
  });
}

/**
 * Update retry strategy outcome after retry completes
 */
export async function updateRetryOutcome(
  runId: string,
  attemptNumber: number,
  outcome: "success" | "failure"
) {
  await supabaseServer
    .from("retry_strategies")
    .update({ outcome })
    .eq("run_id", runId)
    .eq("attempt_number", attemptNumber);
}

/**
 * Get most effective retry strategies for an ATS type
 */
export async function getEffectiveStrategies(atsType: string) {
  const { data } = await supabaseServer
    .from("retry_strategies")
    .select("strategy, outcome, run_id, application_runs!inner(ats_type)")
    .eq("application_runs.ats_type", atsType)
    .not("outcome", "eq", "pending");

  if (!data) return {};

  const stats: Record<string, { total: number; successes: number }> = {};
  for (const r of data) {
    if (!stats[r.strategy]) stats[r.strategy] = { total: 0, successes: 0 };
    stats[r.strategy].total++;
    if (r.outcome === "success") stats[r.strategy].successes++;
  }

  return stats;
}
