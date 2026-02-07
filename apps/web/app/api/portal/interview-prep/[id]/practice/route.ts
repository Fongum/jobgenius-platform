import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: sessions, error } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("*")
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch sessions." }, { status: 500 });
  }

  return Response.json({ sessions: sessions ?? [] });
}

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
    .select("id, content")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  let body: { session_type?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Default to 'qa'
  }

  const sessionType = body.session_type || "qa";

  if (!["qa", "audio_simulation"].includes(sessionType)) {
    return Response.json({ error: "Invalid session type." }, { status: 400 });
  }

  // Build questions from the interview prep content
  const content = prep.content as Record<string, unknown>;
  const likelyQuestions = (content?.likely_questions as string[]) ?? [];
  const answerStructure = (content?.answer_structure as string[]) ?? [];

  const questions = likelyQuestions.slice(0, 10).map((q: string) => ({
    question: q,
    expected_hint: answerStructure.join(" "),
    user_answer: "",
    score: null,
    feedback: null,
  }));

  const { data: session, error } = await supabaseAdmin
    .from("interview_practice_sessions")
    .insert({
      interview_prep_id: params.id,
      job_seeker_id: auth.user.id,
      session_type: sessionType,
      status: "not_started",
      questions,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create session." }, { status: 500 });
  }

  return Response.json({ session }, { status: 201 });
}
