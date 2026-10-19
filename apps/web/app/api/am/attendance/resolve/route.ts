import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  decideForgottenSignOut,
  lastActivityAt,
  openBreak,
  watDateLabel,
  watTime,
  type AttendanceDay,
} from "@/lib/attendance";
import { attachActivity } from "@/lib/attendance-activity";
import { NOTIFICATION_CATEGORIES, sendNotification } from "@/lib/notify";

const DAY_COLUMNS =
  "id, account_manager_id, work_date, signed_in_at, signed_out_at, requested_sign_out_at";

/**
 * POST /api/am/attendance/resolve  { day_id, signed_out_at, note? }
 *
 * A worker fixing a shift they forgot to sign out of. Their activity is
 * the evidence: a time up to the end of their last stretch of work closes
 * the shift straight away, because it can only lower their hours. A later
 * time would add hours nothing recorded, so it is stored as a request and
 * the people managers are told; the shift is credited from activity until
 * one of them sets the time on the attendance board.
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

  const dayId = typeof body.day_id === "string" ? body.day_id : "";
  if (!dayId) {
    return NextResponse.json({ error: "day_id is required." }, { status: 400 });
  }
  const note =
    typeof body.note === "string" && body.note.trim() !== ""
      ? body.note.trim().slice(0, 500)
      : null;

  const { data: row } = await supabaseAdmin
    .from("attendance_days")
    .select(DAY_COLUMNS)
    .eq("id", dayId)
    .maybeSingle();

  // Someone else's shift is reported as missing, not forbidden — the id
  // alone should not confirm it exists.
  if (!row || row.account_manager_id !== auth.user.id) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }

  const { data: breaks } = await supabaseAdmin
    .from("attendance_breaks")
    .select("id, started_at, ended_at")
    .eq("attendance_day_id", dayId)
    .order("started_at", { ascending: true });

  const base: AttendanceDay = {
    id: row.id as string,
    account_manager_id: row.account_manager_id as string,
    work_date: row.work_date as string,
    signed_in_at: row.signed_in_at as string,
    signed_out_at: (row.signed_out_at as string | null) ?? null,
    requested_sign_out_at: (row.requested_sign_out_at as string | null) ?? null,
    breaks: (breaks ?? []).map((entry) => ({
      id: entry.id as string,
      started_at: entry.started_at as string,
      ended_at: (entry.ended_at as string | null) ?? null,
    })),
  };

  const now = new Date();
  const [day] = await attachActivity(supabaseAdmin, [base], now);
  const decision = decideForgottenSignOut(day, body.signed_out_at, now);
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: 400 });
  }

  if (decision.kind === "request") {
    const { error } = await supabaseAdmin
      .from("attendance_days")
      .update({
        requested_sign_out_at: decision.iso,
        requested_at: now.toISOString(),
        request_note: note,
      })
      .eq("id", dayId)
      .is("signed_out_at", null);
    if (error) {
      console.error("[attendance:resolve] request failed", error);
      return NextResponse.json({ error: "Failed to send your request." }, { status: 500 });
    }
    await notifyManagers(day, decision.iso, note, auth.user.name ?? auth.user.email, now);
    return NextResponse.json({ outcome: "requested", requested_sign_out_at: decision.iso });
  }

  // Same as a normal sign-out: a break they never ended closes with it.
  const running = openBreak(day);
  if (running) {
    await supabaseAdmin
      .from("attendance_breaks")
      .update({ ended_at: decision.iso })
      .eq("id", running.id);
  }

  const { error } = await supabaseAdmin
    .from("attendance_days")
    .update({
      signed_out_at: decision.iso,
      close_source: decision.source,
      request_note: note,
    })
    .eq("id", dayId)
    // A manager may have set it between the load and this write.
    .is("signed_out_at", null);
  if (error) {
    console.error("[attendance:resolve] close failed", error);
    return NextResponse.json({ error: "Failed to save your sign-out." }, { status: 500 });
  }

  return NextResponse.json({ outcome: "closed", signed_out_at: decision.iso });
}

async function notifyManagers(
  day: AttendanceDay,
  requestedIso: string,
  note: string | null,
  workerName: string,
  now: Date
) {
  const { data: staff } = await supabaseAdmin
    .from("account_managers")
    .select("id, role");
  const managers = (staff ?? []).filter(
    (m) => isPeopleManagerRole(m.role as string | null) && m.id !== day.account_manager_id
  );

  const lastActive = lastActivityAt(day, now);
  const subject = `${workerName} asked to set their sign-out for ${watDateLabel(day.work_date)}`;
  const body = [
    `${workerName} forgot to sign out on ${watDateLabel(day.work_date)} (signed in ${watTime(
      day.signed_in_at
    )}) and says they left at ${watTime(requestedIso)}.`,
    "",
    lastActive
      ? `Their last activity on the dashboard that day was ${watTime(lastActive)}, so the extra time is not backed by anything the platform recorded — they may have been on calls or WhatsApp.`
      : "There is no dashboard activity on record for that day to check it against.",
    note ? `\nTheir note: ${note}` : "",
    "",
    "Until you set the time on the attendance board, the day counts only the time their activity covers.",
  ].join("\n");

  for (const manager of managers) {
    await sendNotification({
      userId: manager.id as string,
      userType: "am",
      category: NOTIFICATION_CATEGORIES.attendance_sign_out_request,
      subject,
      body,
      linkUrl: `/dashboard/attendance?date=${day.work_date}`,
      channel: "both",
      payload: {
        attendance_day_id: day.id,
        account_manager_id: day.account_manager_id,
        work_date: day.work_date,
        requested_sign_out_at: requestedIso,
        last_active_at: lastActive,
      },
    });
  }
}
