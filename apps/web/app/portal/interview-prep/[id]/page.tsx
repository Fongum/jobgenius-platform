import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import InterviewPrepDetail from "./InterviewPrepDetail";

export default async function InterviewPrepDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      *,
      job_posts ( title, company )
    `)
    .eq("id", params.id)
    .eq("job_seeker_id", user.id)
    .single();

  if (!prep) {
    redirect("/portal/interview-prep");
  }

  // Get videos
  const { data: videos } = await supabaseAdmin
    .from("interview_prep_videos")
    .select("*")
    .eq("interview_prep_id", params.id)
    .order("sort_order", { ascending: true });

  // Get practice sessions
  const { data: sessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("*")
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <InterviewPrepDetail
      prep={prep}
      videos={videos ?? []}
      sessions={sessions ?? []}
    />
  );
}
