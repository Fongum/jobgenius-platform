import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Notifications (migration 079).
//
// Durable record + queue for AM and job_seeker notifications.
// Channels:
//   - in_app : visible at /dashboard/notifications (Phase 1) and the
//              bell once integrated (follow-up).
//   - email  : drained by /api/cron/drain-notifications which calls
//              sendAndLogEmail.
//   - both   : insert + drain.
//
// Non-blocking by design — a notification failure must never break the
// triggering request (payslip update, application pause, etc.).
// ============================================================

const log = createLogger("notify");

export type NotificationChannel = "in_app" | "email" | "both";
export type NotificationUserType = "am" | "job_seeker";
export type NotificationStatus = "pending" | "sent" | "failed" | "read";

/** Stable category strings. Keep in sync with downstream consumers. */
export const NOTIFICATION_CATEGORIES = {
  payslip_issued: "payslip_issued",
  payslip_awaiting_sign: "payslip_awaiting_sign",
  payslip_paid: "payslip_paid",
  application_paused: "application_paused",
  interview_confirmed: "interview_confirmed",
  contract_sent: "contract_sent",
  ai_output_rejected: "ai_output_rejected",
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export interface SendNotificationInput {
  userId: string;
  userType: NotificationUserType;
  category: NotificationCategory | string;
  subject: string;
  body?: string | null;
  linkUrl?: string | null;
  /** Defaults to 'in_app'. Use 'email' or 'both' to enqueue email delivery. */
  channel?: NotificationChannel;
  payload?: Record<string, unknown>;
}

export interface SendNotificationResult {
  /** May be null on insert failure — non-blocking by design. */
  id: string | null;
  channel: NotificationChannel;
}

/**
 * Enqueue a notification. Returns immediately; email delivery is async
 * via the drain-notifications cron.
 */
export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  const channel: NotificationChannel = input.channel ?? "in_app";

  try {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: input.userId,
        user_type: input.userType,
        channel,
        category: input.category,
        subject: input.subject,
        body: input.body ?? null,
        link_url: input.linkUrl ?? null,
        payload: input.payload ?? {},
        // in_app-only rows are considered delivered the moment they're saved.
        status: channel === "in_app" ? "sent" : "pending",
        sent_at: channel === "in_app" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) {
      log.warn("notification insert failed", {
        category: input.category,
        userType: input.userType,
        error: error.message,
      });
      return { id: null, channel };
    }
    return { id: data.id as string, channel };
  } catch (err) {
    log.warn("notification insert threw", {
      category: input.category,
      error: err instanceof Error ? err.message : String(err),
    });
    return { id: null, channel };
  }
}

/**
 * Mark a single notification read for the given user. Ownership-checked.
 */
export async function markRead(
  id: string,
  userId: string,
  userType: NotificationUserType
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("user_type", userType)
    .not("status", "eq", "read")
    .select("id")
    .maybeSingle();
  if (error) {
    log.warn("markRead failed", { id, error: error.message });
    return false;
  }
  return Boolean(data);
}

/**
 * Mark every unread notification read for the given user. Returns count.
 */
export async function markAllRead(
  userId: string,
  userType: NotificationUserType
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("user_type", userType)
    .not("status", "eq", "read")
    .select("id");
  if (error) {
    log.warn("markAllRead failed", { userId, error: error.message });
    return 0;
  }
  return (data ?? []).length;
}

/**
 * Best-effort email-address lookup. Used by the drain cron.
 */
export async function resolveRecipientEmail(
  userId: string,
  userType: NotificationUserType
): Promise<string | null> {
  if (userType === "am") {
    const { data } = await supabaseAdmin
      .from("account_managers")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    return data?.email ?? null;
  }
  const { data } = await supabaseAdmin
    .from("job_seekers")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return data?.email ?? null;
}
