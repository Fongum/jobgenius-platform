import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { scorePracticeAnswer } from "@/lib/portal/practice-scoring";

type TurnPayload = {
  speaker: "interviewer" | "candidate";
  content: string;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

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

  let body: { turns?: TurnPayload[] } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawTurns = Array.isArray(body.turns) ? body.turns : [];
  const cleaned = rawTurns
    .filter((t) => t && typeof t.content === "string" && t.content.trim().length > 0)
    .map((t) => ({
      speaker: t.speaker === "interviewer" ? "interviewer" : "candidate",
      content: t.content.trim(),
    }));

  if (cleaned.length === 0) {
    return Response.json({ error: "No transcript content to save." }, { status: 400 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("voice_interview_turns")
    .delete()
    .eq("session_id", params.sessionId);

  if (deleteError) {
    console.error("[portal:voice-complete] failed to delete old turns:", deleteError);
  }

  const rows: Array<{
    session_id: string;
    turn_number: number;
    speaker: "interviewer" | "candidate";
    content: string;
    score?: number | null;
    feedback?: string | null;
  }> = [];

  let lastQuestion = "Interview response";
  let totalScore = 0;
  let scoreCount = 0;

  for (const turn of cleaned) {
    const turnNumber = rows.length;
    if (turn.speaker === "interviewer") {
      lastQuestion = turn.content;
      rows.push({
        session_id: params.sessionId,
        turn_number: turnNumber,
        speaker: "interviewer",
        content: turn.content,
      });
      continue;
    }

    const score = scorePracticeAnswer(lastQuestion, turn.content);
    rows.push({
      session_id: params.sessionId,
      turn_number: turnNumber,
      speaker: "candidate",
      content: turn.content,
      score: score.score,
      feedback: score.feedback,
    });
    totalScore += score.score;
    scoreCount += 1;
  }

  const { error: insertError } = await supabaseAdmin
    .from("voice_interview_turns")
    .insert(rows);

  if (insertError) {
    return Response.json({ error: "Failed to save transcript." }, { status: 500 });
  }

  const overallScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : null;
  const overallFeedback =
    overallScore !== null
      ? overallScore >= 80
        ? "Excellent performance! You demonstrated strong communication and clear examples."
        : overallScore >= 60
        ? "Good effort. Focus on providing more specific examples and quantifying your impact."
        : "Keep practicing. Work on structuring your answers using the STAR method."
      : null;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("voice_interview_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_turns: rows.length,
      overall_score: overallScore,
      overall_feedback: overallFeedback,
    })
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return Response.json({ error: "Failed to complete session." }, { status: 500 });
  }

  const { data: storedTurns } = await supabaseAdmin
    .from("voice_interview_turns")
    .select("*")
    .eq("session_id", params.sessionId)
    .order("turn_number", { ascending: true });

  return Response.json({ session: updated, turns: storedTurns ?? [] });
}