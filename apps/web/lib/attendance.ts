// ============================================================
// Office attendance clock (migration 115).
//
// Sign in on arrival, toggle breaks, sign out on leaving. Everything
// here is pure — timezone conversion, the state machine, and duration
// maths. The API routes own the database.
//
// All instants are UTC (timestamptz). WAT is the *display* and
// day-boundary timezone: Africa/Lagos, UTC+1 year-round, no daylight
// saving. That last property is why a WAT date is a safe key — it never
// straddles two offsets, so a shift cannot land in an ambiguous hour.
// ============================================================

export const WAT_TIME_ZONE = "Africa/Lagos";
export const WAT_LABEL = "WAT";

export type AttendanceBreak = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

export type AttendanceDay = {
  id: string;
  account_manager_id: string;
  work_date: string;
  signed_in_at: string;
  signed_out_at: string | null;
  breaks: AttendanceBreak[];
  /** Migration 116 — present once an admin has corrected the sign-out. */
  adjusted_by?: string | null;
  adjusted_at?: string | null;
  adjustment_note?: string | null;
  long_shift_alerted_at?: string | null;
  /** Migration 117 — when the worker was asked if they forgot to sign out. */
  self_nudge_sent_at?: string | null;
  /** Migration 127 — 'activity' when the sign-in was backdated to when work began. */
  sign_in_source?: "activity" | null;
  /** Migration 127 — how the shift was closed; null on older rows. */
  close_source?: CloseSource | null;
  /** Migration 127 — a later sign-out the worker asked a manager to approve. */
  requested_sign_out_at?: string | null;
  requested_at?: string | null;
  request_note?: string | null;
  /**
   * Dashboard activity inside this shift's window, when the caller loaded
   * it (lib/attendance-activity.ts). Absent or empty means "no evidence",
   * and every calculation falls back to clock time.
   */
  activity?: ActivitySession[] | null;
};

export type CloseSource = "self" | "activity_confirmed" | "self_reported" | "admin";

export type ActivitySession = {
  started_at: string;
  last_seen_at: string;
};

export type AttendanceStatus = "off" | "working" | "on_break" | "done";

export const ATTENDANCE_ACTIONS = [
  "sign_in",
  "break_start",
  "break_end",
  "sign_out",
] as const;
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];

export function isAttendanceAction(value: unknown): value is AttendanceAction {
  return (
    typeof value === "string" &&
    ATTENDANCE_ACTIONS.includes(value as AttendanceAction)
  );
}

// ─── WAT time ────────────────────────────────────────────────────────────

/**
 * The WAT calendar date (YYYY-MM-DD) an instant falls on.
 *
 * Uses en-CA because it formats as YYYY-MM-DD; building the string from
 * parts would reintroduce the local-timezone bug this exists to avoid.
 */
export function watDate(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Clock time in WAT, 24-hour, e.g. "08:02". */
export function watTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: WAT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "Tuesday, 12 August 2026" in WAT. */
export function watDateLabel(workDate: string): string {
  // Noon UTC is inside the same WAT day whatever the offset, so this
  // cannot slip to the neighbouring date.
  const date = new Date(`${workDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return workDate;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: WAT_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// ─── State machine ───────────────────────────────────────────────────────

export function openBreak(day: AttendanceDay | null): AttendanceBreak | null {
  if (!day) return null;
  return day.breaks.find((entry) => entry.ended_at === null) ?? null;
}

export function deriveStatus(day: AttendanceDay | null): AttendanceStatus {
  if (!day) return "off";
  if (day.signed_out_at) return "done";
  return openBreak(day) ? "on_break" : "working";
}

/**
 * Whether an action is legal from the current status. Signing out while a
 * break is still running is allowed on purpose — people leave without
 * remembering to end it, and refusing would strand the day open forever.
 * The route closes the break at the same instant.
 */
export function canPerform(
  action: AttendanceAction,
  status: AttendanceStatus
): boolean {
  switch (action) {
    case "sign_in":
      return status === "off";
    case "break_start":
      return status === "working";
    case "break_end":
      return status === "on_break";
    case "sign_out":
      return status === "working" || status === "on_break";
    default:
      return false;
  }
}

export function actionRejectionReason(
  action: AttendanceAction,
  status: AttendanceStatus
): string {
  if (action === "sign_in" && status === "done") {
    return "You have already signed out for today.";
  }
  if (action === "sign_in") return "You are already signed in.";
  if (status === "off") return "Sign in first.";
  if (status === "done") return "Your day is already closed.";
  if (action === "break_start") return "You are already on a break.";
  if (action === "break_end") return "You are not on a break.";
  return "That action is not available right now.";
}

// ─── Durations ───────────────────────────────────────────────────────────

function ms(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Total break time. An open break counts up to `now`, so the header ticks
 * while someone is away rather than jumping when they return.
 */
export function breakMs(day: AttendanceDay, now: Date = new Date()): number {
  let total = 0;
  for (const entry of day.breaks) {
    const start = ms(entry.started_at);
    if (start === null) continue;
    const end = ms(entry.ended_at) ?? now.getTime();
    if (end > start) total += end - start;
  }
  return total;
}

/** Time on the clock minus breaks. Never negative. */
export function workedMs(day: AttendanceDay, now: Date = new Date()): number {
  const start = ms(day.signed_in_at);
  if (start === null) return 0;
  const end = ms(day.signed_out_at) ?? now.getTime();
  const gross = end - start;
  if (gross <= 0) return 0;
  return Math.max(0, gross - breakMs(day, now));
}

/** "1h 12m", "45m", "0m" — compact enough for a header. */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0m";
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Decimal hours for reporting, to 2dp. */
export function workedHours(day: AttendanceDay, now: Date = new Date()): number {
  return Math.round((workedMs(day, now) / 3600000) * 100) / 100;
}

/**
 * A shift left open past its own WAT day — someone forgot to sign out.
 * Worth flagging rather than reporting an eighteen-hour day as fact.
 */
export function isStale(day: AttendanceDay, now: Date = new Date()): boolean {
  return !day.signed_out_at && watDate(now) !== day.work_date;
}

// ─── Long-running shifts (migration 116) ─────────────────────────────────

/**
 * Two rungs, an hour apart. Nothing auto-closes at either — a power cut
 * must never be recorded as "went home", and only a person knows what
 * time someone actually left.
 *
 *   9h  — ask the worker whether they forgot. Most forgotten sign-outs
 *         are theirs to fix, and fixing it costs one person a click.
 *  10h  — tell the people managers, who can set a past time (the worker
 *         cannot). Only reached when the nudge went unanswered.
 *
 * Both sit above any believable working day, so they fire on forgotten
 * sign-outs rather than on overtime.
 */
export const SELF_NUDGE_HOURS = 9;
export const LONG_SHIFT_HOURS = 10;

/** Wall-clock time since sign-in, breaks included. */
export function elapsedSinceSignIn(
  day: AttendanceDay,
  now: Date = new Date()
): number {
  const start = ms(day.signed_in_at);
  if (start === null) return 0;
  return Math.max(0, now.getTime() - start);
}

/** Still open, and running past `hours`. The shared shape of both rungs. */
export function isOpenShiftPast(
  day: AttendanceDay,
  hours: number,
  now: Date = new Date()
): boolean {
  if (day.signed_out_at) return false;
  return elapsedSinceSignIn(day, now) >= hours * 3_600_000;
}

/** Past the escalation threshold — a manager's problem now. */
export function isLongOpenShift(
  day: AttendanceDay,
  now: Date = new Date()
): boolean {
  return isOpenShiftPast(day, LONG_SHIFT_HOURS, now);
}

/** Past the nudge threshold — still the worker's own to fix. */
export function needsSelfNudge(
  day: AttendanceDay,
  now: Date = new Date()
): boolean {
  return isOpenShiftPast(day, SELF_NUDGE_HOURS, now);
}

/** True once an admin has corrected this day's sign-out time by hand. */
export function wasAdjusted(day: AttendanceDay): boolean {
  return Boolean(day.adjusted_at);
}

export type SignOutValidation =
  | { ok: true; iso: string }
  | { ok: false; error: string };

/**
 * Checks a hand-entered sign-out time before it is written.
 *
 * This is the one place a human types into an hours record, so it is also
 * the one place a typo becomes payroll. Each rule rejects something that
 * would silently produce a wrong number rather than an obvious error:
 * leaving before arriving, a shift longer than the day it belongs to, a
 * sign-out in the future, or a time that lands before a break the worker
 * had already started.
 */
export function validateAdjustedSignOut(
  day: AttendanceDay,
  value: unknown,
  now: Date = new Date()
): SignOutValidation {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: "A sign-out time is required." };
  }

  const parsed = new Date(value);
  const time = parsed.getTime();
  if (Number.isNaN(time)) {
    return { ok: false, error: "That is not a valid time." };
  }

  const start = ms(day.signed_in_at);
  if (start === null) {
    return { ok: false, error: "This shift has no valid sign-in time." };
  }

  if (time < start) {
    return { ok: false, error: "Sign-out cannot be before sign-in." };
  }

  // A minute of slack: an admin correcting a shift "as of now" will often
  // submit a time a few seconds stale.
  if (time > now.getTime() + 60_000) {
    return { ok: false, error: "Sign-out cannot be in the future." };
  }

  if (time - start > 24 * 3_600_000) {
    return {
      ok: false,
      error: "A shift cannot run longer than 24 hours. Check the date.",
    };
  }

  // An open break that started after the proposed sign-out is a genuine
  // contradiction — the worker went on break after leaving. Clamping it
  // silently would bury the fact that one of the two times is wrong.
  const running = openBreak(day);
  if (running) {
    const breakStart = ms(running.started_at);
    if (breakStart !== null && breakStart > time) {
      return {
        ok: false,
        error: `They started a break at ${watTime(running.started_at)}, after this sign-out time. Pick a later time.`,
      };
    }
  }

  return { ok: true, iso: new Date(time).toISOString() };
}

// ─── Activity-credited time (migration 127) ──────────────────────────────
//
// Clock time is sign-out minus sign-in, so it is only as good as two
// button presses — and in practice a third of shifts were never signed
// out, and some were signed in after midnight. The dashboard knows when
// someone was actually using it, so a shift is credited with the part of
// it that activity covers:
//
//   * sessions closer together than IDLE_GAP_MINUTES are one stretch of
//     work (a call, WhatsApp, a short break without pressing Break),
//   * each stretch runs ACTIVITY_GRACE_MINUTES past its last heartbeat,
//     because the heartbeat is periodic rather than continuous,
//   * the result is clipped to the shift and recorded breaks are taken off.
//
// A forgotten sign-out therefore stops counting at the last activity, and
// a 00:05 sign-in followed by nothing until 08:00 counts from 08:00.
// Computed on read, never written, so these numbers can change later
// without touching anyone's records.

/** Silence after which the heartbeat starts a new session (server write). */
export const SESSION_SPLIT_MINUTES = 10;
/** Gaps up to this long between sessions still count as work. */
export const IDLE_GAP_MINUTES = 60;
/** Credit after the last heartbeat of a stretch. */
export const ACTIVITY_GRACE_MINUTES = 15;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3_600_000;

type Interval = [number, number];

/** True when there is activity evidence to credit the shift from. */
export function hasActivityRecord(day: AttendanceDay): boolean {
  return Array.isArray(day.activity) && day.activity.length > 0;
}

/** Sessions merged into stretches of work, grace included, sorted. */
export function activityBlocks(sessions: ActivitySession[]): Interval[] {
  const parsed: Interval[] = [];
  for (const session of sessions) {
    const start = ms(session.started_at);
    const end = ms(session.last_seen_at);
    if (start === null || end === null || end < start) continue;
    parsed.push([start, end]);
  }
  parsed.sort((a, b) => a[0] - b[0]);

  const merged: Interval[] = [];
  for (const [start, end] of parsed) {
    const last = merged[merged.length - 1];
    // The gap is measured between raw heartbeats, before grace is added.
    if (last && start - last[1] <= IDLE_GAP_MINUTES * MINUTE_MS) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([start, end]) => [start, end + ACTIVITY_GRACE_MINUTES * MINUTE_MS]);
}

/** Where a shift's window ends: sign-out, or now (capped at a day). */
function windowEnd(day: AttendanceDay, start: number, now: Date): number {
  return ms(day.signed_out_at) ?? Math.min(now.getTime(), start + DAY_MS);
}

function clippedBlocks(day: AttendanceDay, now: Date): Interval[] {
  const start = ms(day.signed_in_at);
  if (start === null || !hasActivityRecord(day)) return [];
  const end = windowEnd(day, start, now);
  const blocks: Interval[] = [];
  for (const [a, b] of activityBlocks(day.activity ?? [])) {
    // A shift nobody signed out of must not absorb the next morning's work:
    // a stretch that starts on a later WAT day belongs to another shift.
    // One that started on the day and ran past midnight still counts.
    if (!day.signed_out_at && watDate(new Date(a)) > day.work_date) continue;
    const s = Math.max(a, start);
    const e = Math.min(b, end);
    if (e > s) blocks.push([s, e]);
  }
  return blocks;
}

/**
 * Worked time backed by activity, breaks removed, or null when there is
 * no activity record for the shift (rows from before migration 127).
 */
export function creditedMs(day: AttendanceDay, now: Date = new Date()): number | null {
  if (!hasActivityRecord(day)) return null;
  const start = ms(day.signed_in_at);
  if (start === null) return 0;
  const end = windowEnd(day, start, now);
  const blocks = clippedBlocks(day, now);

  let covered = 0;
  for (const [s, e] of blocks) covered += e - s;

  let onBreak = 0;
  for (const entry of day.breaks) {
    const bs = ms(entry.started_at);
    if (bs === null) continue;
    const be = Math.min(ms(entry.ended_at) ?? end, end);
    for (const [s, e] of blocks) {
      const overlap = Math.min(be, e) - Math.max(bs, s);
      if (overlap > 0) onBreak += overlap;
    }
  }

  return Math.max(0, covered - onBreak);
}

/**
 * The hours a shift counts for in reports, or null when the record cannot
 * support a number.
 *
 *   * corrected by a people manager — their time stands, clock maths,
 *   * activity on record — credited time,
 *   * neither — clock time, except a shift left open past its day, which
 *     is a forgotten sign-out rather than an eighteen-hour day.
 */
export function creditedWorkedMs(
  day: AttendanceDay,
  now: Date = new Date()
): number | null {
  if (day.adjusted_at && day.signed_out_at) return workedMs(day, now);
  const credited = creditedMs(day, now);
  if (credited !== null) return credited;
  return isStale(day, now) ? null : workedMs(day, now);
}

/** Last heartbeat the shift is credited with, as ISO, or null. */
export function lastActivityAt(day: AttendanceDay, now: Date = new Date()): string | null {
  const blocks = clippedBlocks(day, now);
  if (blocks.length === 0) return null;
  const [s, e] = blocks[blocks.length - 1];
  // The block's end carries the grace period; the heartbeat itself was
  // that much earlier (unless the shift window clipped it first).
  return new Date(Math.max(s, e - ACTIVITY_GRACE_MINUTES * MINUTE_MS)).toISOString();
}

/**
 * The sign-out time activity supports for a forgotten shift: the end of
 * the last stretch of work, grace included. Null without activity.
 */
export function suggestedSignOutAt(
  day: AttendanceDay,
  now: Date = new Date()
): string | null {
  const blocks = clippedBlocks(day, now);
  if (blocks.length === 0) return null;
  return new Date(blocks[blocks.length - 1][1]).toISOString();
}

/** Working this long without signing in before the clock says so. */
export const FORGOT_SIGN_IN_MINUTES = 10;

/** WAT midnight at the start of the instant's WAT day. */
export function watDayStart(instant: Date = new Date()): Date {
  return new Date(`${watDate(instant)}T00:00:00+01:00`);
}

/**
 * When the stretch of work someone is in right now began, for a person who
 * has not signed in today — or null when they are not currently active, or
 * have only just started. Never earlier than WAT midnight, so a late night
 * on the dashboard cannot start today's shift.
 *
 * This is the earliest a forgotten sign-in may be backdated to: recorded
 * activity is the evidence, so it needs nobody's approval.
 */
export function activeSince(
  sessions: ActivitySession[],
  now: Date = new Date()
): string | null {
  const blocks = activityBlocks(sessions);
  const current = blocks[blocks.length - 1];
  if (!current) return null;
  const [start, end] = current;
  // Still in it: the last heartbeat is within the grace period.
  if (end < now.getTime()) return null;
  const since = Math.max(start, watDayStart(now).getTime());
  if (now.getTime() - since < FORGOT_SIGN_IN_MINUTES * MINUTE_MS) return null;
  return new Date(since).toISOString();
}

/** Open shifts from earlier days that nobody has asked to fix yet. */
export function unresolvedShifts<T extends AttendanceDay>(
  days: T[],
  now: Date = new Date()
): T[] {
  const today = watDate(now);
  return days
    .filter(
      (day) => !day.signed_out_at && day.work_date < today && !day.requested_sign_out_at
    )
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1));
}

export type ForgottenSignOutDecision =
  | { ok: true; kind: "close"; iso: string; source: "activity_confirmed" | "self_reported" }
  | { ok: true; kind: "request"; iso: string }
  | { ok: false; error: string };

/**
 * What happens when a worker says when they left a shift they forgot to
 * sign out of. Up to what their activity shows, it is their call and the
 * shift closes; anything later is a claim on hours with no evidence, so
 * it waits for a people manager.
 */
export function decideForgottenSignOut(
  day: AttendanceDay,
  value: unknown,
  now: Date = new Date()
): ForgottenSignOutDecision {
  if (day.signed_out_at) return { ok: false, error: "That shift is already signed out." };
  if (day.work_date >= watDate(now)) {
    return { ok: false, error: "Today's shift is still running — use Sign Out." };
  }
  if (day.requested_sign_out_at) {
    return { ok: false, error: "A manager is already reviewing your time for that day." };
  }

  const check = validateAdjustedSignOut(day, value, now);
  if (!check.ok) return check;

  const chosen = new Date(check.iso).getTime();
  const suggested = suggestedSignOutAt(day, now);
  const suggestedMs = suggested ? new Date(suggested).getTime() : null;

  if (suggestedMs !== null && chosen <= suggestedMs + MINUTE_MS) {
    return {
      ok: true,
      kind: "close",
      iso: check.iso,
      source: Math.abs(chosen - suggestedMs) <= MINUTE_MS ? "activity_confirmed" : "self_reported",
    };
  }
  return { ok: true, kind: "request", iso: check.iso };
}

export const CLOSE_SOURCE_LABELS: Record<CloseSource, string> = {
  self: "Signed out",
  activity_confirmed: "Confirmed from activity",
  self_reported: "Reported by them",
  admin: "Set by a manager",
};

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  off: "Not signed in",
  working: "Working",
  on_break: "On break",
  done: "Signed out",
};
