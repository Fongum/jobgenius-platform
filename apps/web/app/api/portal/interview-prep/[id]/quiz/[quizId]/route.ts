import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string; quizId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: quiz, error } = await supabaseAdmin
    .from("interview_quizzes")
    .select("*")
    .eq("id", params.quizId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (error || !quiz) {
    return Response.json({ error: "Quiz not found." }, { status: 404 });
  }

  return Response.json({ quiz });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; quizId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    question_index?: number;
    user_answer?: number;
    status?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Get existing quiz
  const { data: quiz } = await supabaseAdmin
    .from("interview_quizzes")
    .select("*")
    .eq("id", params.quizId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!quiz) {
    return Response.json({ error: "Quiz not found." }, { status: 404 });
  }

  const questions = quiz.questions as {
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
    user_answer: number | null;
    is_correct: boolean | null;
  }[];

  const updates: Record<string, unknown> = {};

  // Start quiz if not started
  if (quiz.status === "not_started") {
    updates.status = "in_progress";
    updates.started_at = new Date().toISOString();
  }

  // Submit an answer
  if (body.question_index !== undefined && body.user_answer !== undefined) {
    const idx = body.question_index;
    if (idx >= 0 && idx < questions.length) {
      questions[idx].user_answer = body.user_answer;
      questions[idx].is_correct = body.user_answer === questions[idx].correct_index;
      updates.questions = questions;
    }
  }

  // Complete quiz
  if (body.status === "completed" || questions.every((q) => q.user_answer !== null)) {
    const correctCount = questions.filter((q) => q.is_correct === true).length;
    updates.status = "completed";
    updates.completed_at = new Date().toISOString();
    updates.correct_count = correctCount;
    updates.score = Math.round((correctCount / questions.length) * 100);
  }

  const { data: updated, error } = await supabaseAdmin
    .from("interview_quizzes")
    .update(updates)
    .eq("id", params.quizId)
    .select("*")
    .single();

  if (error || !updated) {
    return Response.json({ error: "Failed to update quiz." }, { status: 500 });
  }

  return Response.json({ quiz: updated });
}
