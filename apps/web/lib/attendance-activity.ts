// ============================================================
// Dashboard activity for attendance (migration 127).
//
// Writes: the header clock's heartbeat stretches the caller's latest
// session, or starts a new one after SESSION_SPLIT_MINUTES of silence.
// Sessions rather than one row per ping keep a month of the whole team
// to a few thousand rows.
//
// Reads: every report that credits hours attaches each shift's activity
// with attachActivity(), and lib/attendance.ts does the arithmetic.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SESSION_SPLIT_MINUTES,
  type ActivitySession,
  type AttendanceDay,
} from "@/lib/attendance";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3_600_000;
const PAGE = 1000;

/** Heartbeats closer than this to the last one are not worth a write. */
const MIN_WRITE_INTERVAL_MS = 60_000;

/**
 * Record that `accountManagerId` is using the dashboard right now.
 * Best-effort: attendance must keep working if this fails, so errors are
 * logged and swallowed.
 */
export async function recordActivity(
  db: SupabaseClient,
  accountManagerId: string,
  now: Date = new Date()
): Promise<void> {
  try {
    const { data: latest } = await db
      .from("attendance_activity_sessions")
      .select("id, last_seen_at")
      .eq("account_manager_id", accountManagerId)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nowIso = now.toISOString();
    const lastSeen = latest?.last_seen_at
      ? new Date(latest.last_seen_at as string).getTime()
      : null;

    if (lastSeen !== null && now.getTime() - lastSeen < MIN_WRITE_INTERVAL_MS) return;

    if (
      latest?.id &&
      lastSeen !== null &&
      now.getTime() - lastSeen <= SESSION_SPLIT_MINUTES * MINUTE_MS
    ) {
      await db
        .from("attendance_activity_sessions")
        .update({ last_seen_at: nowIso })
        .eq("id", latest.id as string);
      return;
    }

    await db.from("attendance_activity_sessions").insert({
      account_manager_id: accountManagerId,
      started_at: nowIso,
      last_seen_at: nowIso,
    });
  } catch (error) {
    console.error("[attendance:activity] record failed", error);
  }
}

type ShiftLike = Pick<
  AttendanceDay,
  "id" | "account_manager_id" | "signed_in_at" | "signed_out_at"
>;

/**
 * The window a shift's activity is read from: sign-in to sign-out, or for
 * an open shift up to the same person's next sign-in (capped at a day) so
 * tomorrow's work is never credited to a day somebody forgot to close.
 */
function shiftWindows(shifts: ShiftLike[], now: Date): Map<string, [number, number]> {
  const byAm = new Map<string, ShiftLike[]>();
  for (const shift of shifts) {
    const list = byAm.get(shift.account_manager_id) ?? [];
    list.push(shift);
    byAm.set(shift.account_manager_id, list);
  }

  const windows = new Map<string, [number, number]>();
  for (const list of Array.from(byAm.values())) {
    list.sort((a, b) => (a.signed_in_at < b.signed_in_at ? -1 : 1));
    list.forEach((shift, index) => {
      const start = new Date(shift.signed_in_at).getTime();
      if (Number.isNaN(start)) return;
      let end: number;
      if (shift.signed_out_at) {
        end = new Date(shift.signed_out_at).getTime();
      } else {
        end = Math.min(now.getTime(), start + DAY_MS);
        const next = list[index + 1];
        if (next) end = Math.min(end, new Date(next.signed_in_at).getTime());
      }
      windows.set(shift.id, [start, end]);
    });
  }
  return windows;
}

/** Sessions for these people overlapping [from, to], all pages. */
async function loadSessions(
  db: SupabaseClient,
  amIds: string[],
  from: number,
  to: number
): Promise<Array<ActivitySession & { account_manager_id: string }>> {
  const rows: Array<ActivitySession & { account_manager_id: string }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("attendance_activity_sessions")
      .select("account_manager_id, started_at, last_seen_at")
      .in("account_manager_id", amIds)
      .gte("last_seen_at", new Date(from).toISOString())
      .lte("started_at", new Date(to).toISOString())
      .order("started_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`activity lookup failed: ${error.message}`);
    const page = (data ?? []) as Array<ActivitySession & { account_manager_id: string }>;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/**
 * Returns the shifts with `activity` filled in, each session trimmed to
 * its shift's window. A failed lookup leaves activity empty — reports
 * then fall back to clock time rather than failing outright.
 */
export async function attachActivity<T extends ShiftLike>(
  db: SupabaseClient,
  shifts: T[],
  now: Date = new Date()
): Promise<Array<T & { activity: ActivitySession[] }>> {
  if (shifts.length === 0) return [];
  const windows = shiftWindows(shifts, now);
  const values = Array.from(windows.values());
  if (values.length === 0) return shifts.map((s) => ({ ...s, activity: [] }));

  const from = Math.min(...values.map((w) => w[0]));
  const to = Math.max(...values.map((w) => w[1]));
  const amIds = Array.from(new Set(shifts.map((s) => s.account_manager_id)));

  let sessions: Array<ActivitySession & { account_manager_id: string }> = [];
  try {
    sessions = await loadSessions(db, amIds, from, to);
  } catch (error) {
    console.error("[attendance:activity]", error);
  }

  return shifts.map((shift) => {
    const window = windows.get(shift.id);
    if (!window) return { ...shift, activity: [] };
    const [start, end] = window;
    const activity: ActivitySession[] = [];
    for (const session of sessions) {
      if (session.account_manager_id !== shift.account_manager_id) continue;
      const s = new Date(session.started_at).getTime();
      const e = new Date(session.last_seen_at).getTime();
      if (e < start || s > end) continue;
      activity.push({
        started_at: new Date(Math.max(s, start)).toISOString(),
        last_seen_at: new Date(Math.min(e, end)).toISOString(),
      });
    }
    return { ...shift, activity };
  });
}

/** One person's sessions that were still running at or after `since`. */
export async function loadSessionsSince(
  db: SupabaseClient,
  accountManagerId: string,
  since: Date
): Promise<ActivitySession[]> {
  const { data, error } = await db
    .from("attendance_activity_sessions")
    .select("started_at, last_seen_at")
    .eq("account_manager_id", accountManagerId)
    .gte("last_seen_at", since.toISOString())
    .order("started_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[attendance:activity] session lookup failed", error);
    return [];
  }
  return (data ?? []) as ActivitySession[];
}
