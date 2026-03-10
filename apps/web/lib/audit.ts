import { createLogger } from "@/lib/logger";

const log = createLogger("audit");

type AuditAction =
  | "account.approve"
  | "account.reject"
  | "account.update"
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
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/**
 * Log an admin action as structured JSON.
 * In production Vercel captures these via console output; they are queryable
 * in Vercel Logs by filtering on module:"audit".
 *
 * Non-blocking — never throws.
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
    // Swallow — audit logging must never break the request
  }
}
