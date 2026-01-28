import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

type QueueRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  status: string;
  category: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string | null;
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

export default async function QueuePage() {
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Global Queue</h1>
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
        <h1>Global Queue</h1>
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
        <h1>Global Queue</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  const { data: queueRows, error: queueError } = await supabaseServer
    .from("application_queue")
    .select(
      "id, job_seeker_id, job_post_id, status, category, last_error, created_at, updated_at, job_posts (title, company, location), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: false });

  if (queueError) {
    throw new Error("Failed to load application queue.");
  }

  const rows = (queueRows ?? []) as QueueRow[];

  return (
    <main>
      <h1>Global Queue</h1>
      <p>Account Manager: {amEmail}</p>
      {rows.length === 0 ? (
        <p>No queue items.</p>
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
                <div>Category: {row.category ?? "matched"}</div>
                {row.last_error ? <div>Last error: {row.last_error}</div> : null}
                <div>
                  Updated:{" "}
                  {row.updated_at
                    ? new Date(row.updated_at).toLocaleString()
                    : "-"}
                </div>
                <a href={`/dashboard/jobseekers/${row.job_seeker_id}/queue`}>
                  View Queue
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
