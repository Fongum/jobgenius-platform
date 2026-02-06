import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  // Get queued applications
  let queueQuery = supabaseAdmin
    .from("application_queue")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (status) {
    queueQuery = queueQuery.eq("status", status.toUpperCase());
  }

  const { data: queued, error: queueError } = await queueQuery;

  // Get application runs
  let runsQuery = supabaseAdmin
    .from("application_runs")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (status) {
    runsQuery = runsQuery.eq("status", status.toUpperCase());
  }

  const { data: runs, error: runsError } = await runsQuery;

  if (queueError || runsError) {
    return NextResponse.json({ error: "Failed to load applications." }, { status: 500 });
  }

  return NextResponse.json({
    queued: queued || [],
    runs: runs || [],
  });
}
