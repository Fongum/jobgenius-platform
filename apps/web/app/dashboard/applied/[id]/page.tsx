import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

type PageProps = {
  params: { id: string };
};

export default async function AppliedReportPage({ params }: PageProps) {
  const amEmail = getAmEmailFromHeaders();
  const runId = params.id;

  if (!amEmail) {
    return (
      <main>
        <h1>Application Report</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return (
      <main>
        <h1>Application Report</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, job_seeker_id, job_post_id, ats_type, status, current_step, updated_at, job_posts (title, company, url), job_seekers (full_name, email)"
    )
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return (
      <main>
        <h1>Application Report</h1>
        <p>Run not found.</p>
      </main>
    );
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", accountManager.id)
    .eq("job_seeker_id", run.job_seeker_id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return (
      <main>
        <h1>Application Report</h1>
        <p>Not authorized for this job seeker.</p>
      </main>
    );
  }

  const { data: events } = await supabaseServer
    .from("apply_run_events")
    .select("ts, level, event_type, payload")
    .eq("run_id", runId)
    .order("ts", { ascending: true });

  const post = Array.isArray(run.job_posts) ? run.job_posts[0] : run.job_posts;
  const seeker = Array.isArray(run.job_seekers)
    ? run.job_seekers[0]
    : run.job_seekers;

  return (
    <main>
      <h1>Application Report</h1>
      <p>
        {post?.title ?? "Untitled"} {post?.company ? `- ${post.company}` : ""}
      </p>
      <p>
        Job seeker: {seeker?.full_name ?? "Unknown"}{" "}
        {seeker?.email ? `(${seeker.email})` : ""}
      </p>
      <p>Status: {run.status}</p>
      <p>ATS: {run.ats_type}</p>
      <p>Updated: {new Date(run.updated_at).toLocaleString()}</p>
      <a href={`/api/apply/report/${run.id}/pdf`}>Download PDF</a>
      <section>
        <h2>Events</h2>
        {events && events.length > 0 ? (
          <ul>
            {events.map((event) => (
              <li key={`${event.ts}-${event.event_type}`}>
                {new Date(event.ts).toLocaleString()} [{event.level}]{" "}
                {event.event_type}
              </li>
            ))}
          </ul>
        ) : (
          <p>No events recorded.</p>
        )}
      </section>
    </main>
  );
}
