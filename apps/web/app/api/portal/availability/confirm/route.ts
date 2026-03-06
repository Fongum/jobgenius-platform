import { NextRequest, NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

// POST /api/portal/availability/confirm
// Upserts a confirmation record for the current ISO week.
export async function POST(req: NextRequest) {
  const auth = await requireJobSeeker(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;
  const weekStart = getISOMonday(new Date());

  const { error } = await supabaseAdmin
    .from("job_seeker_availability_confirmations")
    .upsert(
      { job_seeker_id: seekerId, week_start: weekStart, confirmed_at: new Date().toISOString() },
      { onConflict: "job_seeker_id,week_start" }
    );

  if (error) {
    return NextResponse.json({ error: "Failed to confirm availability" }, { status: 500 });
  }

  return NextResponse.json({ success: true, week_start: weekStart });
}

function getISOMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
