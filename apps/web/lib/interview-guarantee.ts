// ============================================================
// Interview Guarantee status (Collaboration Agreement section 1).
//
// Essentials/Premium: if the client has no Qualifying Interview within 90 days of
// Campaign Activation (setup fee confirmed paid), JobGenius owes a strategy review
// and keeps working at no charge until the first interview.
//
// Qualifying Interview = any non-cancelled interview logged on or after activation
// (recruiter screens count; attendance and outcome don't matter).
// Pauses (client paused / unresponsive) are NOT tracked here; AMs apply them by hand,
// so the day count shown is the maximum, never less than the contractual count.
// ============================================================

import { INTERVIEW_GUARANTEE_DAYS, hasInterviewGuarantee } from "@/app/components/homepage/marketingContent";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Warn the AM this many days before the guarantee date. */
export const GUARANTEE_WARNING_DAYS = 21;

export type InterviewGuaranteeState =
  | "not_applicable" // Recurring or no plan
  | "not_activated" // setup fee not yet confirmed paid
  | "met" // a Qualifying Interview happened
  | "on_track" // inside the window, not close to the deadline
  | "at_risk" // within GUARANTEE_WARNING_DAYS of the deadline
  | "triggered"; // deadline passed with no Qualifying Interview: remedy owed

export interface InterviewGuaranteeStatus {
  state: InterviewGuaranteeState;
  activatedAt: string | null;
  /** ISO date (YYYY-MM-DD) the 90 days end. */
  guaranteeDate: string | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  firstQualifyingInterviewAt: string | null;
}

export function computeInterviewGuarantee(input: {
  tier: string | null | undefined;
  /** job_seekers.setup_fee_paid_at */
  activatedAt: string | null | undefined;
  interviews: { scheduled_at: string | null; status?: string | null }[];
  now?: Date;
}): InterviewGuaranteeStatus {
  const empty = {
    activatedAt: null,
    guaranteeDate: null,
    daysElapsed: null,
    daysRemaining: null,
    firstQualifyingInterviewAt: null,
  };
  if (!hasInterviewGuarantee(input.tier)) return { state: "not_applicable", ...empty };
  if (!input.activatedAt) return { state: "not_activated", ...empty };

  const now = input.now ?? new Date();
  const activated = new Date(input.activatedAt);
  const deadline = new Date(activated.getTime() + INTERVIEW_GUARANTEE_DAYS * DAY_MS);

  const qualifying = input.interviews
    .filter((i) => i.scheduled_at && (i.status ?? "").toLowerCase() !== "cancelled")
    .map((i) => new Date(i.scheduled_at as string))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= activated.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  const daysElapsed = Math.max(0, Math.floor((now.getTime() - activated.getTime()) / DAY_MS));
  const daysRemaining = Math.max(0, INTERVIEW_GUARANTEE_DAYS - daysElapsed);
  const base = {
    activatedAt: activated.toISOString(),
    guaranteeDate: deadline.toISOString().split("T")[0],
    daysElapsed,
    daysRemaining,
    firstQualifyingInterviewAt: qualifying[0]?.toISOString() ?? null,
  };

  if (qualifying.length > 0) return { state: "met", ...base };
  if (now.getTime() >= deadline.getTime()) return { state: "triggered", ...base };
  if (daysRemaining <= GUARANTEE_WARNING_DAYS) return { state: "at_risk", ...base };
  return { state: "on_track", ...base };
}
