import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/attendance-activity";

/**
 * POST /api/am/attendance/ping
 *
 * Heartbeat from the header clock, sent only while the dashboard tab is
 * visible and someone has used the keyboard or mouse recently. The time is
 * the server's; the body is ignored. See migration 127.
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await recordActivity(supabaseAdmin, auth.user.id);
  return NextResponse.json({ ok: true });
}
