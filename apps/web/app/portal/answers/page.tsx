import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import AnswersClient from "./AnswersClient";

export default async function AnswersPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: answers } = await supabaseAdmin
    .from("job_seeker_answers")
    .select("*")
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: true });

  return <AnswersClient initialAnswers={answers || []} />;
}
