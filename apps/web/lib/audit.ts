import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/auth";

const log = createLogger("audit");

type AuditAction =
  | "account.approve"
  | "account.reject"
  | "account.update"
  | "account.convert"
  | "account.delete"
  | "assignment.create"
  | "assignment.delete"
  | "assignment.bulk"
  | "billing.acknowledge_payment"
  | "billing.escalation"
  | "billing.settings_update"
  | "billing.offer_confirm"
  | "billing.flex_review"
  | "billing.payment_details"
  | "lead.import"
  | "broadcast.send"
  | "referral.update"
  | "recruiter_partner.send_workspace_link"
  | "intake.approve"
  | "intake.waitlist"
  | "intake.reject"
  | "intake.start_preview"
  | "intake.expire_preview"
  | "job_agent.trigger"
  | "career_crawl.trigger"
  | "promote_jobs.run"
  | "voice.playbook_create"
  | "voice.playbook_update"
  | "voice.dispatch"
  | "reports.settings_update";

export interface AuditParams {
  adminId: string;
  adminEmail?: string;
  adminRole?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Log an admin action.
 *
 * Writes both:
 *   1. Structured console JSON (queryable in Vercel Logs by module:"audit")
 *   2. A row in `audit_logs` (migration 078) for persistent forensics.
 *
 * Non-blocking — never throws. DB insert failures are logged and swallowed.
 */
export async function logAdminAction(params: AuditParams): Promise<void> {
  try {
    log.info(`admin:${params.action}`, {
      admin_id: params.adminId,
      admin_email: params.adminEmail,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      ...params.details,
    });
  } catch {
    // Swallow console failure
  }

  try {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      actor_id: params.adminId,
      actor_email: params.adminEmail ?? null,
      actor_role: params.adminRole ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      details: params.details ?? {},
      ip: params.ip ?? null,
      user_agent: params.userAgent ?? null,
    });
    if (error) {
      // Persist failure to console so we can detect it without breaking the request.
      log.warn("audit_logs insert failed", { action: params.action, error: error.message });
    }
  } catch (err) {
    log.warn("audit_logs insert threw", {
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
