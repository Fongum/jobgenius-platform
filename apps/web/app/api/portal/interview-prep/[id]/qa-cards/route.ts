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

  // Verify prep ownership
  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  // Get cards
  const { data: cards, error } = await supabaseAdmin
    .from("interview_qa_cards")
    .select("*")
    .eq("interview_prep_id", params.id)
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json({ error: "Failed to fetch Q&A cards." }, { status: 500 });
  }

  // Get seeker's responses
  const cardIds = (cards ?? []).map((c) => c.id);
  let responses: { qa_card_id: string; user_answer: string; ai_feedback: string | null; score: number | null; is_starred: boolean }[] = [];

  if (cardIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("interview_qa_responses")
      .select("qa_card_id, user_answer, ai_feedback, score, is_starred")
      .eq("job_seeker_id", auth.user.id)
      .in("qa_card_id", cardIds);
    responses = data ?? [];
  }

  const responseMap = new Map(responses.map((r) => [r.qa_card_id, r]));

  const enriched = (cards ?? []).map((card) => ({
    ...card,
    response: responseMap.get(card.id) ?? null,
  }));

  return Response.json({ cards: enriched });
}
