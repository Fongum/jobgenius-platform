import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ApplicationsClient from "./ApplicationsClient";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: queued } = await supabaseAdmin
    .from("application_queue")
    .select("*")
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select("*")
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <ApplicationsClient
      initialQueued={queued || []}
      initialRuns={runs || []}
    />
  );
}
