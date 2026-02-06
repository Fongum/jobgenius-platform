import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import InterviewsClient from "./InterviewsClient";

export default async function InterviewsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select("*")
    .eq("job_seeker_id", user.id)
    .order("scheduled_at", { ascending: true });

  const interviewIds = (interviews || []).map((i: { id: string }) => i.id);
  let prep: Record<string, unknown>[] = [];
  if (interviewIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("interview_prep")
      .select("*")
      .in("interview_id", interviewIds);
    prep = data || [];
  }

  return (
    <InterviewsClient
      initialInterviews={interviews || []}
      initialPrep={prep}
    />
  );
}
