import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Get the track with lessons
  const { data: track, error } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published")
    .single();

  if (error || !track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  // Get progress for all lessons in this track
  const lessonIds = ((track.learning_lessons as { id: string }[]) ?? []).map((l) => l.id);

  let progress: { lesson_id: string; status: string; started_at: string | null; completed_at: string | null; time_spent_seconds: number; quiz_score: number | null }[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_progress")
      .select("*")
      .eq("job_seeker_id", auth.user.id)
      .in("lesson_id", lessonIds);
    progress = data ?? [];
  }

  // Get bookmarks
  let bookmarks: { lesson_id: string; note: string | null }[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_bookmarks")
      .select("lesson_id, note")
      .eq("job_seeker_id", auth.user.id)
      .in("lesson_id", lessonIds);
    bookmarks = data ?? [];
  }

  const progressMap = new Map(progress.map((p) => [p.lesson_id, p]));
  const bookmarkSet = new Set(bookmarks.map((b) => b.lesson_id));

  // Sort lessons by sort_order
  const lessons = ((track.learning_lessons as Record<string, unknown>[]) ?? [])
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((lesson) => ({
      ...lesson,
      progress: progressMap.get(lesson.id as string) ?? null,
      is_bookmarked: bookmarkSet.has(lesson.id as string),
    }));

  const completedCount = lessons.filter(
    (l) => l.progress?.status === "completed"
  ).length;

  return Response.json({
    track: {
      ...track,
      learning_lessons: lessons,
      progress: {
        total_lessons: lessons.length,
        completed_lessons: completedCount,
        percentage:
          lessons.length > 0
            ? Math.round((completedCount / lessons.length) * 100)
            : 0,
      },
    },
  });
}
