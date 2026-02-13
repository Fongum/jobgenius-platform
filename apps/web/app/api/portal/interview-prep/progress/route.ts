import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: sessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("id, overall_score, status, questions, completed_at, created_at")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  const allSessions = sessions ?? [];
  const completed = allSessions.filter((s) => s.status === "completed");

  const total_sessions = completed.length;

  const total_questions_answered = allSessions.reduce((sum, s) => {
    const questions = (s.questions as Array<{ user_answer?: string }>) ?? [];
    return sum + questions.filter((q) => q.user_answer).length;
  }, 0);

  const scores = completed
    .map((s) => s.overall_score as number | null)
    .filter((s): s is number => s !== null);

  const average_score =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  const best_score = scores.length > 0 ? Math.max(...scores) : 0;

  const recentScores = scores.slice(0, 5);
  const olderScores = scores.slice(5);

  const recent_average =
    recentScores.length > 0
      ? Math.round(
          recentScores.reduce((a, b) => a + b, 0) / recentScores.length
        )
      : 0;

  const older_average =
    olderScores.length > 0
      ? Math.round(
          olderScores.reduce((a, b) => a + b, 0) / olderScores.length
        )
      : 0;

  // Streak: consecutive days with at least one completed session, working backwards from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completedDates = new Set(
    completed
      .filter((s) => s.completed_at)
      .map((s) => {
        const d = new Date(s.completed_at as string);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
  );

  let streak_days = 0;
  const checkDate = new Date(today);
  while (true) {
    if (completedDates.has(checkDate.getTime())) {
      streak_days++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // This week stats
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const sessionsThisWeek = completed.filter((s) => {
    const d = s.completed_at ? new Date(s.completed_at as string) : null;
    return d && d >= oneWeekAgo;
  });

  const sessions_this_week = sessionsThisWeek.length;

  const questions_this_week = sessionsThisWeek.reduce((sum, s) => {
    const questions = (s.questions as Array<{ user_answer?: string }>) ?? [];
    return sum + questions.filter((q) => q.user_answer).length;
  }, 0);

  let score_trend: "improving" | "stable" | "declining" = "stable";
  if (recentScores.length >= 2 && olderScores.length >= 1) {
    const diff = recent_average - older_average;
    if (diff >= 5) score_trend = "improving";
    else if (diff <= -5) score_trend = "declining";
  }

  return Response.json({
    progress: {
      total_sessions,
      total_questions_answered,
      average_score,
      best_score,
      recent_average,
      older_average,
      streak_days,
      sessions_this_week,
      questions_this_week,
      score_trend,
    },
  });
}
