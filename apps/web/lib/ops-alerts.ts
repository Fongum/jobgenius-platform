import { supabaseServer } from "@/lib/supabase/server";

export type OpsAlertInput = {
  severity: "HIGH" | "MEDIUM" | "LOW";
  type: string;
  message: string;
  meta?: Record<string, unknown>;
};

/** Best-effort Slack post; a missing webhook or a failed call never throws. */
export async function sendSlackAlert(text: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Best-effort only.
  }
}

/**
 * Raise an ops alert unless an unresolved alert of the same type already exists
 * (so a repeating failure produces one alert, not one per job). HIGH alerts also
 * go to Slack. Never throws: alerting must not break the work it reports on.
 */
export async function raiseOpsAlert(
  alert: OpsAlertInput
): Promise<{ created: boolean }> {
  try {
    const { data: existing, error: lookupError } = await supabaseServer
      .from("ops_alerts")
      .select("id")
      .eq("type", alert.type)
      .is("resolved_at", null)
      .limit(1);

    if (lookupError) {
      console.error("[ops-alerts] dedupe lookup failed:", lookupError);
      return { created: false };
    }
    if (existing && existing.length > 0) return { created: false };

    const { error: insertError } = await supabaseServer.from("ops_alerts").insert({
      severity: alert.severity,
      type: alert.type,
      message: alert.message,
      meta: alert.meta ?? {},
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[ops-alerts] insert failed:", insertError);
      return { created: false };
    }

    if (alert.severity === "HIGH") {
      await sendSlackAlert(`[${alert.type}] ${alert.message}`);
    }
    return { created: true };
  } catch (err) {
    console.error("[ops-alerts] unexpected failure:", err);
    return { created: false };
  }
}
