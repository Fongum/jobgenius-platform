import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { getInterviewerResponse } from "@/lib/portal/ai-voice-interviewer";

export async function POST(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify session ownership and status
  const { data: session } = await supabaseAdmin
    .from("voice_interview_sessions")
    .select("*, interview_prep_id")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  if (session.status === "completed") {
    return Response.json({ error: "Session is already completed." }, { status: 400 });
  }

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return Response.json({ error: "Content is required." }, { status: 400 });
  }

  // Get existing turns
  const { data: existingTurns } = await supabaseAdmin
    .from("voice_interview_turns")
    .select("turn_number, speaker, content")
    .eq("session_id", params.sessionId)
    .order("turn_number", { ascending: true });

  const turns = existingTurns ?? [];
  const nextTurnNumber = turns.length;

  // Get job details for AI context
  let jobTitle = "Position";
  let companyName: string | null = null;
  let descriptionText: string | null = null;

  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("job_post_id")
    .eq("id", params.id)
    .single();

  if (prep?.job_post_id) {
    const { data: jobPost } = await supabaseAdmin
      .from("job_posts")
      .select("title, company, description_text")
      .eq("id", prep.job_post_id)
      .single();

    if (jobPost) {
      jobTitle = jobPost.title;
      companyName = jobPost.company;
      descriptionText = jobPost.description_text;
    }
  }

  // Save candidate turn
  const { data: candidateTurn, error: candidateError } = await supabaseAdmin
    .from("voice_interview_turns")
    .insert({
      session_id: params.sessionId,
      turn_number: nextTurnNumber,
      speaker: "candidate",
      content: body.content.trim(),
    })
    .select("*")
    .single();

  if (candidateError) {
    return Response.json({ error: "Failed to save turn." }, { status: 500 });
  }

  // Build turn history for AI
  const turnHistory = [
    ...turns.map((t) => ({ speaker: t.speaker, content: t.content })),
    { speaker: "candidate", content: body.content.trim() },
  ];

  // Get AI interviewer response
  const aiResponse = await getInterviewerResponse({
    persona: session.interviewer_persona,
    jobTitle,
    companyName,
    descriptionText,
    turnHistory,
    turnNumber: nextTurnNumber + 1,
    candidateResponse: body.content.trim(),
  });

  // Update candidate turn with score/feedback
  if (aiResponse.score !== null) {
    await supabaseAdmin
      .from("voice_interview_turns")
      .update({
        score: aiResponse.score,
        feedback: aiResponse.feedback,
      })
      .eq("id", candidateTurn.id);
  }

  // Save interviewer response turn
  const { data: interviewerTurn, error: interviewerError } = await supabaseAdmin
    .from("voice_interview_turns")
    .insert({
      session_id: params.sessionId,
      turn_number: nextTurnNumber + 1,
      speaker: "interviewer",
      content: aiResponse.response,
    })
    .select("*")
    .single();

  if (interviewerError) {
    return Response.json({ error: "Failed to save interviewer response." }, { status: 500 });
  }

  // Update session turn count
  await supabaseAdmin
    .from("voice_interview_sessions")
    .update({ total_turns: nextTurnNumber + 2 })
    .eq("id", params.sessionId);

  return Response.json({
    candidate_turn: {
      ...candidateTurn,
      score: aiResponse.score,
      feedback: aiResponse.feedback,
    },
    interviewer_turn: interviewerTurn,
    is_final: aiResponse.is_final,
    score: aiResponse.score,
    feedback: aiResponse.feedback,
  });
}
