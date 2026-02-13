import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { scorePracticeAnswer, calculateOverallScore } from "@/lib/portal/practice-scoring";
import { scoreWithAI, isAIScoringAvailable } from "@/lib/portal/ai-practice-scoring";

export async function GET(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: session, error } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (error || !session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify ownership
  const { data: existingSession } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("id, questions")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!existingSession) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  let body: {
    questions?: Array<{
      question: string;
      user_answer: string;
      expected_hint?: string;
      score?: number | null;
      feedback?: string | null;
      star_score?: number | null;
      relevance_score?: number | null;
      specificity_score?: number | null;
      confidence_coaching?: string | null;
      rewrite_suggestions?: string[] | null;
    }>;
    status?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.questions) {
    // Score any answers that don't have scores yet
    let scoredQuestions;

    if (isAIScoringAvailable()) {
      // Fetch job context for AI scoring
      let jobTitle: string | undefined;
      let companyName: string | undefined;
      let jobDescription: string | undefined;

      const { data: prepData } = await supabaseAdmin
        .from("interview_prep")
        .select("job_post_id")
        .eq("id", params.id)
        .single();

      if (prepData?.job_post_id) {
        const { data: jobPost } = await supabaseAdmin
          .from("job_posts")
          .select("title, company, description_text")
          .eq("id", prepData.job_post_id)
          .single();

        if (jobPost) {
          jobTitle = jobPost.title;
          companyName = jobPost.company;
          jobDescription = jobPost.description_text;
        }
      }

      scoredQuestions = await Promise.all(
        body.questions.map(async (q) => {
          if (q.user_answer && (q.score === null || q.score === undefined)) {
            const result = await scoreWithAI({
              question: q.question,
              userAnswer: q.user_answer,
              jobTitle,
              companyName,
              jobDescription,
            });
            return {
              ...q,
              score: result.score,
              feedback: result.feedback,
              star_score: result.star_score,
              relevance_score: result.relevance_score,
              specificity_score: result.specificity_score,
              confidence_coaching: result.confidence_coaching,
              rewrite_suggestions: result.rewrite_suggestions,
            };
          }
          return q;
        })
      );
    } else {
      scoredQuestions = body.questions.map((q) => {
        if (q.user_answer && (q.score === null || q.score === undefined)) {
          const result = scorePracticeAnswer(q.question, q.user_answer);
          return {
            ...q,
            score: result.score,
            feedback: result.feedback,
            star_score: result.star_score,
            relevance_score: result.relevance_score,
            specificity_score: result.specificity_score,
            confidence_coaching: result.confidence_coaching,
            rewrite_suggestions: result.rewrite_suggestions,
          };
        }
        return q;
      });
    }

    updates.questions = scoredQuestions;
    updates.overall_score = calculateOverallScore(scoredQuestions);
  }

  if (body.status === "in_progress") {
    updates.status = "in_progress";
    updates.started_at = new Date().toISOString();
  } else if (body.status === "completed") {
    updates.status = "completed";
    updates.completed_at = new Date().toISOString();
  }

  const { data: session, error } = await supabaseAdmin
    .from("interview_practice_sessions")
    .update(updates)
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to update session." }, { status: 500 });
  }

  return Response.json({ session });
}
