import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const runner = request.headers.get("x-runner") ?? "";

  if (!authHeader && !runner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("jobSeekerId");

  if (!jobSeekerId) {
    return NextResponse.json(
      { error: "jobSeekerId is required" },
      { status: 400 },
    );
  }

  const { data: answers, error } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .select("*")
    .eq("job_seeker_id", jobSeekerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answers: answers ?? [] });
}
