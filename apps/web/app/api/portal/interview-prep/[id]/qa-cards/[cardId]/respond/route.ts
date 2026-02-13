import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { scorePracticeAnswer } from "@/lib/portal/practice-scoring";

export async function POST(
  request: Request,
  { params }: { params: { id: string; cardId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify card belongs to seeker's prep
  const { data: card } = await supabaseAdmin
    .from("interview_qa_cards")
    .select("id, question, interview_prep_id")
    .eq("id", params.cardId)
    .eq("interview_prep_id", params.id)
    .single();

  if (!card) {
    return Response.json({ error: "Q&A card not found." }, { status: 404 });
  }

  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  let body: { user_answer?: string; is_starred?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.user_answer?.trim()) {
    return Response.json({ error: "Answer is required." }, { status: 400 });
  }

  // Score the answer
  const scoring = scorePracticeAnswer(card.question, body.user_answer.trim());

  // Upsert response
  const { data: response, error } = await supabaseAdmin
    .from("interview_qa_responses")
    .upsert(
      {
        qa_card_id: params.cardId,
        job_seeker_id: auth.user.id,
        user_answer: body.user_answer.trim(),
        ai_feedback: scoring.feedback,
        score: scoring.score,
        is_starred: body.is_starred ?? false,
        created_at: new Date().toISOString(),
      },
      { onConflict: "qa_card_id,job_seeker_id" }
    )
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to save response." }, { status: 500 });
  }

  return Response.json({
    response,
    scoring: {
      score: scoring.score,
      feedback: scoring.feedback,
      confidence_coaching: scoring.confidence_coaching,
      rewrite_suggestions: scoring.rewrite_suggestions,
    },
  });
}
