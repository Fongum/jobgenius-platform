import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { getInterviewerResponse } from "@/lib/portal/ai-voice-interviewer";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify prep ownership
  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id, job_post_id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  let body: { persona?: string } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const validPersonas = ["professional", "technical", "behavioral", "stress"];
  const persona = validPersonas.includes(body.persona ?? "")
    ? body.persona!
    : "professional";

  // Get job details for context
  let jobTitle = "Position";
  let companyName: string | null = null;
  let descriptionText: string | null = null;

  if (prep.job_post_id) {
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

  // Create session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("voice_interview_sessions")
    .insert({
      interview_prep_id: params.id,
      job_seeker_id: auth.user.id,
      interviewer_persona: persona,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (sessionError || !session) {
    return Response.json({ error: "Failed to create session." }, { status: 500 });
  }

  // Generate the opening question
  const aiResponse = await getInterviewerResponse({
    persona,
    jobTitle,
    companyName,
    descriptionText,
    turnHistory: [],
    turnNumber: 0,
  });

  // Save the interviewer's opening turn
  const { data: turn, error: turnError } = await supabaseAdmin
    .from("voice_interview_turns")
    .insert({
      session_id: session.id,
      turn_number: 0,
      speaker: "interviewer",
      content: aiResponse.response,
    })
    .select("*")
    .single();

  if (turnError) {
    return Response.json({ error: "Failed to save interviewer turn." }, { status: 500 });
  }

  // Update total turns
  await supabaseAdmin
    .from("voice_interview_sessions")
    .update({ total_turns: 1 })
    .eq("id", session.id);

  return Response.json(
    {
      session: { ...session, total_turns: 1 },
      turn,
    },
    { status: 201 }
  );
}
