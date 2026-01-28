import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

type RunRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  queue_id: string | null;
  ats_type: string;
  status: string;
  current_step: string;
  last_error: string | null;
  last_error_code: string | null;
  last_seen_url: string | null;
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

type PageProps = {
  searchParams?: {
    ats_type?: string;
    reason?: string;
  };
};

export default async function AttentionPage({ searchParams }: PageProps) {
  const amEmail = getAmEmailFromHeaders();
  const atsFilter = searchParams?.ats_type?.trim();
  const reasonFilter = searchParams?.reason?.trim();

  if (!amEmail) {
    return (
      <main>
        <h1>Needs Attention</h1>
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
        <h1>Needs Attention</h1>
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
        <h1>Needs Attention</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  let query = supabaseServer
    .from("application_runs")
    .select(
      "id, job_seeker_id, job_post_id, queue_id, ats_type, status, current_step, last_error, last_error_code, last_seen_url, updated_at, job_posts (title, company, location), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .eq("status", "NEEDS_ATTENTION");

  if (atsFilter) {
    query = query.eq("ats_type", atsFilter);
  }

  if (reasonFilter) {
    query = query.eq("last_error_code", reasonFilter);
  }

  const { data: runRows, error: runError } = await query.order("updated_at", {
    ascending: false,
  });

  if (runError) {
    throw new Error("Failed to load attention runs.");
  }

  const rows = (runRows ?? []) as RunRow[];

  return (
    <main>
      <h1>Needs Attention</h1>
      <p>Account Manager: {amEmail}</p>
      <form method="get" style={{ display: "flex", gap: "8px" }}>
        <label>
          ATS{" "}
          <input name="ats_type" defaultValue={atsFilter ?? ""} placeholder="LINKEDIN" />
        </label>
        <label>
          Reason{" "}
          <input name="reason" defaultValue={reasonFilter ?? ""} placeholder="CAPTCHA" />
        </label>
        <button type="submit">Filter</button>
      </form>
      {rows.length === 0 ? (
        <p>No items need attention.</p>
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
                <div>ATS: {row.ats_type}</div>
                <div>Step: {row.current_step}</div>
                <div>Status: {row.status}</div>
                {row.last_error_code ? (
                  <div>Reason: {row.last_error_code}</div>
                ) : null}
                {row.last_error ? <div>Last error: {row.last_error}</div> : null}
                {row.last_seen_url ? (
                  <div>Last URL: {row.last_seen_url}</div>
                ) : null}
                <div>
                  Updated: {new Date(row.updated_at).toLocaleString()}
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
