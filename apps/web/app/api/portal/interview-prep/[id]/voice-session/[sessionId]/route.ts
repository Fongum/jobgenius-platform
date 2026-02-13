import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: session, error } = await supabaseAdmin
    .from("voice_interview_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (error || !session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: turns } = await supabaseAdmin
    .from("voice_interview_turns")
    .select("*")
    .eq("session_id", params.sessionId)
    .order("turn_number", { ascending: true });

  return Response.json({ session, turns: turns ?? [] });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify session ownership
  const { data: session } = await supabaseAdmin
    .from("voice_interview_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  // Complete the session
  const { data: turns } = await supabaseAdmin
    .from("voice_interview_turns")
    .select("score, speaker")
    .eq("session_id", params.sessionId);

  const candidateTurns = (turns ?? []).filter(
    (t) => t.speaker === "candidate" && t.score !== null
  );

  const overallScore =
    candidateTurns.length > 0
      ? Math.round(
          candidateTurns.reduce((sum, t) => sum + (t.score ?? 0), 0) /
            candidateTurns.length
        )
      : null;

  const { data: updated, error } = await supabaseAdmin
    .from("voice_interview_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      overall_score: overallScore,
      overall_feedback:
        overallScore !== null
          ? overallScore >= 80
            ? "Excellent performance! You demonstrated strong communication and clear examples."
            : overallScore >= 60
            ? "Good effort. Focus on providing more specific examples and quantifying your impact."
            : "Keep practicing. Work on structuring your answers using the STAR method."
          : null,
    })
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    return Response.json({ error: "Failed to complete session." }, { status: 500 });
  }

  return Response.json({ session: updated });
}
