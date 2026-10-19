import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import {
  actionRejectionReason,
  canPerform,
  deriveStatus,
  isAttendanceAction,
  lastActivityAt,
  openBreak,
  suggestedSignOutAt,
  unresolvedShifts,
  watDate,
  type AttendanceDay,
} from "@/lib/attendance";
import { attachActivity, recordActivity } from "@/lib/attendance-activity";

const DAY_COLUMNS =
  "id, account_manager_id, work_date, signed_in_at, signed_out_at";
const BREAK_COLUMNS = "id, attendance_day_id, started_at, ended_at";

/** How far back a forgotten sign-out is still offered for fixing. */
const UNRESOLVED_LOOKBACK_DAYS = 30;

/**
 * The caller's most recent earlier shift left open, with what their
 * activity says about when they left — shown by the header clock so the
 * worker fixes it while they still remember. Null when there is none.
 */
async function loadUnresolved(accountManagerId: string, now: Date) {
  const since = new Date(now.getTime() - UNRESOLVED_LOOKBACK_DAYS * 86_400_000);
  const { data: rows, error } = await supabaseAdmin
    .from("attendance_days")
    .select(`${DAY_COLUMNS}, requested_sign_out_at`)
    .eq("account_manager_id", accountManagerId)
    .is("signed_out_at", null)
    .lt("work_date", watDate(now))
    .gte("work_date", watDate(since))
    .order("work_date", { ascending: false });

  if (error) {
    console.error("[attendance:unresolved]", error);
    return { unresolved: null, pending_requests: 0 };
  }

  const days = (rows ?? []).map((row) => ({
    id: row.id as string,
    account_manager_id: row.account_manager_id as string,
    work_date: row.work_date as string,
    signed_in_at: row.signed_in_at as string,
    signed_out_at: null,
    requested_sign_out_at: (row.requested_sign_out_at as string | null) ?? null,
    breaks: [] as AttendanceDay["breaks"],
  }));
  const pending = days.filter((d) => d.requested_sign_out_at).length;
  const open = unresolvedShifts(days, now);
  if (open.length === 0) return { unresolved: null, pending_requests: pending };

  const target = open[0];
  const full = await loadDay(accountManagerId, target.work_date);
  if (!full) return { unresolved: null, pending_requests: pending };
  const [withActivity] = await attachActivity(supabaseAdmin, [full], now);

  return {
    unresolved: {
      day: { ...withActivity, activity: undefined },
      last_active_at: lastActivityAt(withActivity, now),
      suggested_sign_out_at: suggestedSignOutAt(withActivity, now),
      others: open.length - 1,
    },
    pending_requests: pending,
  };
}

/** The caller's shift for a WAT date, breaks included. */
async function loadDay(
  accountManagerId: string,
  workDate: string
): Promise<AttendanceDay | null> {
  const { data: day } = await supabaseAdmin
    .from("attendance_days")
    .select(DAY_COLUMNS)
    .eq("account_manager_id", accountManagerId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (!day) return null;

  const { data: breaks } = await supabaseAdmin
    .from("attendance_breaks")
    .select(BREAK_COLUMNS)
    .eq("attendance_day_id", day.id as string)
    .order("started_at", { ascending: true });

  return {
    id: day.id as string,
    account_manager_id: day.account_manager_id as string,
    work_date: day.work_date as string,
    signed_in_at: day.signed_in_at as string,
    signed_out_at: (day.signed_out_at as string | null) ?? null,
    breaks: (breaks ?? []).map((entry) => ({
      id: entry.id as string,
      started_at: entry.started_at as string,
      ended_at: (entry.ended_at as string | null) ?? null,
    })),
  };
}

// GET /api/am/attendance — the caller's shift for today (WAT) and its status.
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const workDate = watDate(now);
  const [day, unresolved] = await Promise.all([
    loadDay(auth.user.id, workDate),
    loadUnresolved(auth.user.id, now),
  ]);

  return NextResponse.json({
    work_date: workDate,
    server_time: now.toISOString(),
    status: deriveStatus(day),
    day,
    ...unresolved,
  });
}

/**
 * POST /api/am/attendance  { action: sign_in | break_start | break_end | sign_out }
 *
 * The clock is the server's, never the browser's — a client with a wrong
 * system time (or an interest in one) must not be able to set its own hours.
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;
  if (!isAttendanceAction(action)) {
    return NextResponse.json(
      { error: "action must be sign_in, break_start, break_end or sign_out." },
      { status: 400 }
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const workDate = watDate(now);

  // Pressing a clock button is activity like any other.
  await recordActivity(supabaseAdmin, auth.user.id, now);

  const existing = await loadDay(auth.user.id, workDate);
  const status = deriveStatus(existing);

  if (!canPerform(action, status)) {
    return NextResponse.json(
      { error: actionRejectionReason(action, status), status },
      { status: 409 }
    );
  }

  if (action === "sign_in") {
    const { error } = await supabaseAdmin.from("attendance_days").insert({
      account_manager_id: auth.user.id,
      work_date: workDate,
      signed_in_at: nowIso,
    });
    if (error) {
      // 23505 = the unique (account_manager_id, work_date) index; a double
      // click raced us. The day exists either way, so report the truth.
      if (error.code === "23505") {
        const day = await loadDay(auth.user.id, workDate);
        return NextResponse.json({ work_date: workDate, status: deriveStatus(day), day });
      }
      console.error("[attendance:sign_in]", error);
      return NextResponse.json({ error: "Failed to sign in." }, { status: 500 });
    }
  }

  if (action === "break_start" && existing) {
    const { error } = await supabaseAdmin.from("attendance_breaks").insert({
      attendance_day_id: existing.id,
      started_at: nowIso,
    });
    if (error) {
      // Partial unique index on one open break per day.
      if (error.code === "23505") {
        const day = await loadDay(auth.user.id, workDate);
        return NextResponse.json({ work_date: workDate, status: deriveStatus(day), day });
      }
      console.error("[attendance:break_start]", error);
      return NextResponse.json({ error: "Failed to start break." }, { status: 500 });
    }
  }

  if (action === "break_end" && existing) {
    const running = openBreak(existing);
    if (running) {
      const { error } = await supabaseAdmin
        .from("attendance_breaks")
        .update({ ended_at: nowIso })
        .eq("id", running.id);
      if (error) {
        console.error("[attendance:break_end]", error);
        return NextResponse.json({ error: "Failed to end break." }, { status: 500 });
      }
    }
  }

  if (action === "sign_out" && existing) {
    // Close a forgotten break at the same instant, so worked time never
    // counts the tail of a break nobody ended.
    const running = openBreak(existing);
    if (running) {
      await supabaseAdmin
        .from("attendance_breaks")
        .update({ ended_at: nowIso })
        .eq("id", running.id);
    }
    const { error } = await supabaseAdmin
      .from("attendance_days")
      .update({ signed_out_at: nowIso, close_source: "self" })
      .eq("id", existing.id);
    if (error) {
      console.error("[attendance:sign_out]", error);
      return NextResponse.json({ error: "Failed to sign out." }, { status: 500 });
    }
  }

  const day = await loadDay(auth.user.id, workDate);
  return NextResponse.json({
    work_date: workDate,
    server_time: nowIso,
    status: deriveStatus(day),
    day,
  });
}
