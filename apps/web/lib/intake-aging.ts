// ============================================================
// How long seekers have been stuck waiting on a human in the intake pipeline.
//
// Production (2026-09-19): 5 seekers were "approved, awaiting payment" with no
// update for 116 days, and 7 were "pending review" for 11-55 days (median 39).
// Nothing monitored intake age, nothing notified anyone, and the admin queue
// showed submission *dates* but never how long someone had been waiting.
//
// Two queues, each with its own service-level target:
//   review  — submitted / pending_review / call_completed: a human must decide.
//   payment — approved_payment_pending: approved, waiting on the seeker to pay.
// Anything else (preview, waitlist, active, rejected) is not "stuck on us".
//
// Pure and client-safe: no Supabase/server imports, so the admin UI and the
// alert job share one definition.
// ============================================================

export type IntakeAgingScope = "review" | "payment";

export type IntakeAgingRow = {
  id?: string;
  status: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  call_completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type IntakeSla = { review: number; payment: number };

export const DEFAULT_REVIEW_SLA_DAYS = 3;
export const DEFAULT_PAYMENT_SLA_DAYS = 7;
/** An overdue queue is escalated to HIGH once its oldest item is this many times over target. */
export const ESCALATION_MULTIPLE = 3;

export const REVIEW_STATUSES = ["submitted", "pending_review", "call_completed"] as const;
export const PAYMENT_STATUSES = ["approved_payment_pending"] as const;
export const AGING_STATUSES: string[] = [...REVIEW_STATUSES, ...PAYMENT_STATUSES];

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getIntakeSla(
  env: Record<string, string | undefined> = process.env
): IntakeSla {
  return {
    review: positiveDays(env.INTAKE_REVIEW_SLA_DAYS, DEFAULT_REVIEW_SLA_DAYS),
    payment: positiveDays(env.INTAKE_PAYMENT_SLA_DAYS, DEFAULT_PAYMENT_SLA_DAYS),
  };
}

function firstDate(...values: Array<string | null | undefined>): Date | null {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

/** Which queue a row is waiting in, and since when. Null if it is not waiting on us. */
export function intakeWaiting(row: IntakeAgingRow): { scope: IntakeAgingScope; since: Date } | null {
  if (row.status === "approved_payment_pending") {
    const since = firstDate(row.approved_at, row.updated_at, row.created_at);
    return since ? { scope: "payment", since } : null;
  }
  if (row.status === "call_completed") {
    const since = firstDate(row.call_completed_at, row.submitted_at, row.updated_at, row.created_at);
    return since ? { scope: "review", since } : null;
  }
  if (row.status === "submitted" || row.status === "pending_review") {
    const since = firstDate(row.submitted_at, row.created_at, row.updated_at);
    return since ? { scope: "review", since } : null;
  }
  return null;
}

export function daysWaiting(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

export type QueueAging = {
  /** Everyone waiting in this queue, on target or not. */
  waiting: number;
  /** Waiting longer than the target. */
  overdue: number;
  /** Days the longest-waiting item has waited (0 if none). */
  oldestDays: number;
  slaDays: number;
};

export type IntakeAgingSummary = Record<IntakeAgingScope, QueueAging>;

export function summarizeIntakeAging(
  rows: IntakeAgingRow[],
  now: Date = new Date(),
  sla: IntakeSla = getIntakeSla()
): IntakeAgingSummary {
  const summary: IntakeAgingSummary = {
    review: { waiting: 0, overdue: 0, oldestDays: 0, slaDays: sla.review },
    payment: { waiting: 0, overdue: 0, oldestDays: 0, slaDays: sla.payment },
  };

  for (const row of rows) {
    const waiting = intakeWaiting(row);
    if (!waiting) continue;
    const queue = summary[waiting.scope];
    const days = daysWaiting(waiting.since, now);
    queue.waiting++;
    queue.oldestDays = Math.max(queue.oldestDays, days);
    if (days > queue.slaDays) queue.overdue++;
  }

  return summary;
}

export type IntakeAlert = {
  severity: "HIGH" | "MEDIUM";
  type: "INTAKE_OVERDUE";
  message: string;
  meta: { scope: IntakeAgingScope; overdue: number; waiting: number; oldest_days: number; sla_days: number };
};

const LABEL: Record<IntakeAgingScope, string> = {
  review: "awaiting intake review",
  payment: "approved and awaiting payment",
};

/** One alert per queue that has anything overdue; none when everything is on target. */
export function intakeAlertsFrom(summary: IntakeAgingSummary): IntakeAlert[] {
  const alerts: IntakeAlert[] = [];
  for (const scope of ["review", "payment"] as const) {
    const q = summary[scope];
    if (q.overdue === 0) continue;
    alerts.push({
      severity: q.oldestDays > q.slaDays * ESCALATION_MULTIPLE ? "HIGH" : "MEDIUM",
      type: "INTAKE_OVERDUE",
      message: `${q.overdue} seeker${q.overdue === 1 ? "" : "s"} ${LABEL[scope]} for more than ${q.slaDays} days (oldest: ${q.oldestDays} days).`,
      meta: {
        scope,
        overdue: q.overdue,
        waiting: q.waiting,
        oldest_days: q.oldestDays,
        sla_days: q.slaDays,
      },
    });
  }
  return alerts;
}

/** Text and urgency for the "waiting" badge in the admin queue; null when not applicable. */
export function waitingBadge(
  row: IntakeAgingRow,
  now: Date = new Date(),
  sla: IntakeSla = getIntakeSla()
): { label: string; overdue: boolean } | null {
  const waiting = intakeWaiting(row);
  if (!waiting) return null;
  const days = daysWaiting(waiting.since, now);
  const target = waiting.scope === "review" ? sla.review : sla.payment;
  const what = waiting.scope === "review" ? "for review" : "for payment";
  const label = days === 0 ? `Waiting today ${what}` : `Waiting ${days}d ${what}`;
  return { label, overdue: days > target };
}
