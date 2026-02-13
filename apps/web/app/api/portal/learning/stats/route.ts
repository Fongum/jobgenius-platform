import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Get all progress records for this seeker
  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("*")
    .eq("job_seeker_id", auth.user.id);

  const records = progress ?? [];
  const completed = records.filter((r) => r.status === "completed");
  const totalTime = records.reduce((sum, r) => sum + (r.time_spent_seconds ?? 0), 0);

  // Get total tracks assigned
  const { data: tracks } = await supabaseAdmin
    .from("learning_tracks")
    .select("id, learning_lessons ( id )")
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published");

  const totalLessons = (tracks ?? []).reduce(
    (sum, t) => sum + ((t.learning_lessons as { id: string }[])?.length ?? 0),
    0
  );

  // Calculate streak (consecutive days with completed lessons)
  const completedDates = completed
    .filter((r) => r.completed_at)
    .map((r) => new Date(r.completed_at).toISOString().split("T")[0])
    .sort()
    .reverse();

  const seenDates: Record<string, boolean> = {};
  const uniqueDates = completedDates.filter((date) => {
    if (seenDates[date]) return false;
    seenDates[date] = true;
    return true;
  });
  let streak = 0;
  const today = new Date().toISOString().split("T")[0];

  for (let i = 0; i < uniqueDates.length; i++) {
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - i);
    const expected = expectedDate.toISOString().split("T")[0];

    if (uniqueDates[i] === expected) {
      streak++;
    } else if (i === 0 && uniqueDates[0] !== today) {
      // Allow yesterday to count as start of streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (uniqueDates[0] === yesterday.toISOString().split("T")[0]) {
        streak = 1;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // This week stats
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const thisWeekCompleted = completed.filter(
    (r) => r.completed_at && r.completed_at > weekAgoIso
  );

  return Response.json({
    stats: {
      total_tracks: (tracks ?? []).length,
      total_lessons: totalLessons,
      completed_lessons: completed.length,
      completion_percentage:
        totalLessons > 0 ? Math.round((completed.length / totalLessons) * 100) : 0,
      total_time_seconds: totalTime,
      streak_days: streak,
      lessons_this_week: thisWeekCompleted.length,
    },
  });
}
