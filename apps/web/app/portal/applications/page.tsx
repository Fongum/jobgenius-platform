import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ApplicationsClient from "./ApplicationsClient";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Fetch queued applications with job post details
  const { data: queued } = await supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at,
      job_post_id,
      job_posts (
        id, title, company, location, url, work_type
      )
    `)
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch application runs with job post details
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select(`
      id, status, created_at, updated_at, error_message,
      resume_url_used, resume_source,
      job_post_id,
      job_posts (
        id, title, company, location, url, work_type
      )
    `)
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <ApplicationsClient
      initialQueued={queued || []}
      initialRuns={runs || []}
    />
  );
}
