import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: interviews, error } = await supabaseAdmin
    .from("interviews")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("scheduled_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load interviews." }, { status: 500 });
  }

  // Get prep materials for each interview
  const interviewIds = (interviews || []).map((i: { id: string }) => i.id);
  let prep: Record<string, unknown>[] = [];

  if (interviewIds.length > 0) {
    const { data: prepData } = await supabaseAdmin
      .from("interview_prep")
      .select("*")
      .in("interview_id", interviewIds);
    prep = prepData || [];
  }

  return NextResponse.json({
    interviews: interviews || [],
    prep,
  });
}
