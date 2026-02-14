import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Get all bookmarks for this seeker with lesson + track info
  const { data: bookmarks, error } = await supabaseAdmin
    .from("learning_bookmarks")
    .select(`
      id,
      note,
      created_at,
      learning_lessons!inner (
        id,
        title,
        content_type,
        estimated_minutes,
        track_id,
        learning_tracks!inner (
          id,
          title
        )
      )
    `)
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch bookmarks." }, { status: 500 });
  }

  // Get progress for bookmarked lessons
  const lessonIds = (bookmarks ?? []).map(
    (b) => (b.learning_lessons as unknown as { id: string }).id
  );

  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("lesson_id, status, completed_at")
    .eq("job_seeker_id", auth.user.id)
    .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["__none__"]);

  const progressMap = new Map(
    (progress ?? []).map((p) => [p.lesson_id, p])
  );

  const enriched = (bookmarks ?? []).map((b) => {
    const lesson = b.learning_lessons as unknown as {
      id: string;
      title: string;
      content_type: string;
      estimated_minutes: number;
      track_id: string;
      learning_tracks: { id: string; title: string };
    };
    return {
      id: b.id,
      note: b.note,
      bookmarked_at: b.created_at,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        content_type: lesson.content_type,
        estimated_minutes: lesson.estimated_minutes,
        status: progressMap.get(lesson.id)?.status ?? "not_started",
      },
      track: {
        id: lesson.learning_tracks.id,
        title: lesson.learning_tracks.title,
      },
    };
  });

  return Response.json({ bookmarks: enriched });
}
