import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LearningTrackEditor from "./LearningTrackEditor";

export default async function TrackDetailPage({
  params,
}: {
  params: { trackId: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: track } = await supabaseServer
    .from("learning_tracks")
    .select(`
      *,
      job_seekers ( id, full_name, email, skills, seniority ),
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("account_manager_id", user.id)
    .single();

  if (!track) {
    redirect("/dashboard/learning");
  }

  // Sort lessons by sort_order
  const lessons = ((track.learning_lessons as Record<string, unknown>[]) ?? []).sort(
    (a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
  );

  return (
    <LearningTrackEditor
      track={{ ...track, learning_lessons: lessons }}
    />
  );
}
