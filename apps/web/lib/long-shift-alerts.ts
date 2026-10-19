// ============================================================
// Open-shift reminders (migrations 116 and 117).
//
// Nothing in this system auto-closes a shift. A power cut, a flat
// battery or a closed laptop must never be recorded as "went home", and
// the only person who knows what time someone actually left is a person.
//
// So instead of guessing, an hourly sweep walks two rungs:
//
//   SELF_NUDGE_HOURS (9)  — ask the worker whether they forgot to sign
//                           out. They can still sign out themselves, so
//                           this costs one person one click.
//   LONG_SHIFT_HOURS (10) — tell the people managers, who unlike the
//                           worker can set a past sign-out time via
//                           PATCH /api/am/attendance/day/[id].
//
// Each rung fires once per shift, keyed on its own column, and the key is
// stamped whether or not the notification insert succeeded: an hourly job
// that retried a failed send would re-notify every hour until somebody
// acted. One missed reminder is a smaller problem than an inbox nobody
// can silence.
// ============================================================

import { createLogger } from "@/lib/logger";
import {
  LONG_SHIFT_HOURS,
  SELF_NUDGE_HOURS,
  elapsedSinceSignIn,
  formatDuration,
  watDateLabel,
  watTime,
  type AttendanceDay,
} from "@/lib/attendance";

const log = createLogger("long-shift-alerts");

export const LONG_SHIFT_CATEGORY = "attendance_long_shift";
export const SELF_NUDGE_CATEGORY = "attendance_sign_out_reminder";

export type LongShiftAlert = {
  day_id: string;
  account_manager_id: string;
  am_name: string;
  work_date: string;
  signed_in_at: string;
  elapsed_ms: number;
};

/** One alert as the people manager reads it. Pure. */
export function composeLongShiftMessage(alert: LongShiftAlert): {
  subject: string;
  body: string;
} {
  return {
    subject: `${alert.am_name} has been signed in for ${formatDuration(alert.elapsed_ms)}`,
    body: [
      `${alert.am_name} signed in at ${watTime(alert.signed_in_at)} on ${watDateLabel(
        alert.work_date
      )} and has not signed out — ${formatDuration(alert.elapsed_ms)} ago.`,
      "",
      `They were asked about it themselves after ${SELF_NUDGE_HOURS} hours and the shift is still open.`,
      "",
      "Most likely they lost power or closed the laptop without signing out. Nothing has been closed automatically, because guessing an end time would put a wrong number into their hours.",
      "",
      "You probably do not need to do anything. Their hours for the day stop at their last activity on the dashboard, and they will be asked to confirm when they left the next time they open it. Anything later than their activity comes to you for approval.",
      "",
      "If you already know what time they left, you can set it on the attendance board.",
    ].join("\n"),
  };
}

/**
 * The earlier rung, addressed to the worker. Pure.
 *
 * Written for the likeliest reader: someone who did leave, hours ago, and
 * is seeing this on their phone. It says what to do in both cases and
 * does not accuse them of anything — a shift left open is almost always a
 * dead laptop, not a timesheet being padded.
 */
export function composeSelfNudgeMessage(alert: LongShiftAlert): {
  subject: string;
  body: string;
} {
  return {
    subject: `You are still signed in — ${formatDuration(alert.elapsed_ms)} so far`,
    body: [
      `You signed in at ${watTime(alert.signed_in_at)} on ${watDateLabel(
        alert.work_date
      )} and have not signed out.`,
      "",
      "If you are still working, ignore this and sign out when you leave.",
      "",
      "If you already left — power cut, laptop died, or you simply forgot — open the dashboard. The clock in the header shows your last activity and asks when you left. Confirming that time, or an earlier one, fixes it straight away.",
      "",
      "A later time goes to a people manager to approve, because you cannot backdate past what was recorded yourself: hours records are only extended by someone other than the person they belong to.",
      "",
      `Until then your hours stop at your last activity on the dashboard, and after ${LONG_SHIFT_HOURS} hours your manager is told the shift is still open.`,
    ].join("\n"),
  };
}

export type LongShiftSweepResult = {
  open_shifts: number;
  /** Rung one: workers asked whether they forgot. */
  nudged: number;
  /** Rung two: shifts escalated to people managers. */
  alerted: number;
  recipients: number;
};

/**
 * Walk both rungs. A shift that crossed 9h and 10h between two sweeps
 * fires both in the same run — each is stamped separately, so neither is
 * skipped and neither repeats.
 */
export async function sweepLongShifts(
  now: Date = new Date()
): Promise<LongShiftSweepResult> {
  // Imported here, not at the top, so the composition above stays
  // testable without database env vars (as lib/client-reports.ts does).
  const { supabaseServer: db } = await import("@/lib/supabase/server");
  const { sendNotification } = await import("@/lib/notify");
  const { isPeopleManagerRole } = await import("@/lib/auth/roles");

  const nudgeCutoff = new Date(now.getTime() - SELF_NUDGE_HOURS * 3_600_000);
  const alertCutoff = new Date(now.getTime() - LONG_SHIFT_HOURS * 3_600_000);

  // One query at the earlier threshold feeds both rungs — every shift old
  // enough to escalate is also old enough to nudge.
  const { data: open, error } = await db
    .from("attendance_days")
    .select(
      "id, account_manager_id, work_date, signed_in_at, self_nudge_sent_at, long_shift_alerted_at"
    )
    .is("signed_out_at", null)
    .lte("signed_in_at", nudgeCutoff.toISOString())
    .order("signed_in_at", { ascending: true });

  if (error) {
    log.error("open shift lookup failed", { error: error.message });
    throw new Error("Failed to load open shifts.");
  }

  const rows = open ?? [];
  if (rows.length === 0) {
    return { open_shifts: 0, nudged: 0, alerted: 0, recipients: 0 };
  }

  // Names for the people in the alert, and the managers to send it to.
  // One query — roles are normalised in code, not filterable in PostgREST.
  const { data: staff, error: staffError } = await db
    .from("account_managers")
    .select("id, name, email, role");

  if (staffError) {
    log.error("staff lookup failed", { error: staffError.message });
    throw new Error("Failed to load account managers.");
  }

  const nameById = new Map(
    (staff ?? []).map((m) => {
      const name = typeof m.name === "string" ? m.name.trim() : "";
      const email = typeof m.email === "string" ? m.email.trim() : "";
      return [m.id as string, name || email || "An account manager"];
    })
  );

  const managers = (staff ?? []).filter((m) =>
    isPeopleManagerRole(m.role as string | null)
  );

  function toAlert(row: (typeof rows)[number]): LongShiftAlert {
    return {
      day_id: row.id as string,
      account_manager_id: row.account_manager_id as string,
      am_name: nameById.get(row.account_manager_id as string) ?? "An account manager",
      work_date: row.work_date as string,
      signed_in_at: row.signed_in_at as string,
      elapsed_ms: elapsedSinceSignIn(
        {
          id: row.id as string,
          account_manager_id: row.account_manager_id as string,
          work_date: row.work_date as string,
          signed_in_at: row.signed_in_at as string,
          signed_out_at: null,
          breaks: [],
        } satisfies AttendanceDay,
        now
      ),
    };
  }

  /** Stamps the rung's key. Failure to stamp means the rung did not count. */
  async function stamp(dayId: string, column: string): Promise<boolean> {
    const { error: stampError } = await db
      .from("attendance_days")
      .update({ [column]: now.toISOString() })
      .eq("id", dayId);
    if (stampError) {
      log.warn("failed to stamp shift", {
        day_id: dayId,
        column,
        error: stampError.message,
      });
      return false;
    }
    return true;
  }

  // ── Rung one: ask the worker ───────────────────────────────────────────
  let nudged = 0;

  for (const row of rows) {
    if (row.self_nudge_sent_at) continue;

    const alert = toAlert(row);
    const { subject, body } = composeSelfNudgeMessage(alert);

    await sendNotification({
      userId: alert.account_manager_id,
      userType: "am",
      category: SELF_NUDGE_CATEGORY,
      subject,
      body,
      linkUrl: "/dashboard/attendance",
      channel: "both",
      payload: {
        attendance_day_id: alert.day_id,
        work_date: alert.work_date,
        signed_in_at: alert.signed_in_at,
        hours_open: Math.round((alert.elapsed_ms / 3_600_000) * 10) / 10,
      },
    });

    if (await stamp(alert.day_id, "self_nudge_sent_at")) nudged += 1;
  }

  // ── Rung two: escalate to people managers ──────────────────────────────
  const toEscalate = rows.filter(
    (row) =>
      !row.long_shift_alerted_at &&
      (row.signed_in_at as string) <= alertCutoff.toISOString()
  );

  // Nobody to tell: leave those shifts unstamped so they escalate once a
  // manager exists, rather than being silently swallowed now. The nudges
  // above already went out — they do not depend on a manager existing.
  if (toEscalate.length > 0 && managers.length === 0) {
    log.warn("long shifts found but no people manager to notify", {
      open_shifts: rows.length,
      pending: toEscalate.length,
    });
    return { open_shifts: rows.length, nudged, alerted: 0, recipients: 0 };
  }

  let alerted = 0;

  for (const row of toEscalate) {
    const alert = toAlert(row);
    const { subject, body } = composeLongShiftMessage(alert);

    for (const manager of managers) {
      await sendNotification({
        userId: manager.id as string,
        userType: "am",
        category: LONG_SHIFT_CATEGORY,
        subject,
        body,
        linkUrl: `/dashboard/attendance?date=${alert.work_date}`,
        channel: "both",
        payload: {
          attendance_day_id: alert.day_id,
          account_manager_id: alert.account_manager_id,
          work_date: alert.work_date,
          signed_in_at: alert.signed_in_at,
          hours_open: Math.round((alert.elapsed_ms / 3_600_000) * 10) / 10,
        },
      });
    }

    // Stamped regardless of send outcome — see the header note on why a
    // retrying hourly job is worse than one lost alert.
    if (await stamp(alert.day_id, "long_shift_alerted_at")) alerted += 1;
  }

  log.info("open shift sweep complete", {
    open_shifts: rows.length,
    nudged,
    alerted,
    recipients: managers.length,
  });

  return {
    open_shifts: rows.length,
    nudged,
    alerted,
    recipients: managers.length,
  };
}
