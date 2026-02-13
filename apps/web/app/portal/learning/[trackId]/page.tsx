import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import LearningTrackView from "./LearningTrackView";

export default async function TrackViewPage({
  params,
}: {
  params: { trackId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: track } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("job_seeker_id", user.id)
    .eq("status", "published")
    .single();

  if (!track) {
    redirect("/portal/learning");
  }

  const lessonIds = ((track.learning_lessons as { id: string }[]) ?? []).map((l) => l.id);

  // Fetch progress
  let progress: Record<string, unknown>[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_progress")
      .select("*")
      .eq("job_seeker_id", user.id)
      .in("lesson_id", lessonIds);
    progress = data ?? [];
  }

  // Fetch bookmarks
  let bookmarks: { lesson_id: string }[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_bookmarks")
      .select("lesson_id")
      .eq("job_seeker_id", user.id)
      .in("lesson_id", lessonIds);
    bookmarks = data ?? [];
  }

  // Sort lessons
  const lessons = ((track.learning_lessons as Record<string, unknown>[]) ?? []).sort(
    (a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
  );

  const progressMap = new Map(
    progress.map((p) => [p.lesson_id as string, p])
  );
  const bookmarkSet = new Set(bookmarks.map((b) => b.lesson_id));

  const enrichedLessons = lessons.map((l) => ({
    ...l,
    progress: progressMap.get(l.id as string) ?? null,
    is_bookmarked: bookmarkSet.has(l.id as string),
  }));

  return (
    <LearningTrackView
      track={{ ...track, learning_lessons: enrichedLessons }}
    />
  );
}
