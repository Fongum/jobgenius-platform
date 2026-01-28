import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

type RunRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  status: string;
  updated_at: string;
  job_posts:
    | {
        title: string;
        company: string | null;
        location: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
        location: string | null;
      }>
    | null;
  job_seekers:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
};

export default async function AppliedPage() {
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Applied / Completed</h1>
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
        <h1>Applied / Completed</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", accountManager.id);

  if (assignmentsError) {
    throw new Error("Failed to load job seeker assignments.");
  }

  const seekerIds = (assignments ?? []).map(
    (assignment) => assignment.job_seeker_id
  );

  if (seekerIds.length === 0) {
    return (
      <main>
        <h1>Applied / Completed</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  const { data: runRows, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, job_seeker_id, job_post_id, status, updated_at, job_posts (title, company, location), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .in("status", ["APPLIED", "COMPLETED"])
    .order("updated_at", { ascending: false });

  if (runError) {
    throw new Error("Failed to load applied runs.");
  }

  const rows = (runRows ?? []) as RunRow[];

  return (
    <main>
      <h1>Applied / Completed</h1>
      <p>Account Manager: {amEmail}</p>
      {rows.length === 0 ? (
        <p>No applied runs.</p>
      ) : (
        <ul style={{ display: "grid", gap: "12px" }}>
          {rows.map((row) => {
            const post = Array.isArray(row.job_posts)
              ? row.job_posts[0]
              : row.job_posts;
            const seeker = Array.isArray(row.job_seekers)
              ? row.job_seekers[0]
              : row.job_seekers;

            return (
              <li
                key={row.id}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "12px",
                  borderRadius: "8px",
                }}
              >
                <strong>{post?.title ?? "Untitled"}</strong>
                {post?.company ? ` - ${post.company}` : ""}
                {post?.location ? ` (${post.location})` : ""}
                <div>
                  Job seeker: {seeker?.full_name ?? "Unknown"}{" "}
                  {seeker?.email ? `(${seeker.email})` : ""}
                </div>
                <div>Status: {row.status}</div>
                <div>Updated: {new Date(row.updated_at).toLocaleString()}</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <a href={`/dashboard/applied/${row.id}`}>View Report</a>
                  <a href={`/api/apply/report/${row.id}/pdf`}>
                    Download Report PDF
                  </a>
                  <a href={`/dashboard/interview-prep`}>Interview Prep</a>
                  <a href={`/dashboard/jobseekers/${row.job_seeker_id}/queue`}>
                    View Queue
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
