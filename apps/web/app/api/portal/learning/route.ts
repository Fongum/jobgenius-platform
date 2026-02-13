import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Get published tracks for this seeker with lessons
  const { data: tracks, error } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( id, title, sort_order, content_type, estimated_minutes )
    `)
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json({ error: "Failed to fetch tracks." }, { status: 500 });
  }

  // Get progress for all lessons
  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("lesson_id, status, completed_at, time_spent_seconds")
    .eq("job_seeker_id", auth.user.id);

  const progressMap = new Map(
    (progress ?? []).map((p) => [p.lesson_id, p])
  );

  // Enrich tracks with progress info
  const enriched = (tracks ?? []).map((track) => {
    const lessons = (track.learning_lessons as { id: string }[]) ?? [];
    const completedCount = lessons.filter(
      (l) => progressMap.get(l.id)?.status === "completed"
    ).length;
    const totalTime = lessons.reduce(
      (sum, l) => sum + (progressMap.get(l.id)?.time_spent_seconds ?? 0),
      0
    );

    return {
      ...track,
      progress: {
        total_lessons: lessons.length,
        completed_lessons: completedCount,
        percentage: lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0,
        total_time_seconds: totalTime,
      },
    };
  });

  return Response.json({ tracks: enriched });
}
