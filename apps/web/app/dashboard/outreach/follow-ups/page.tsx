import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type ThreadRow = {
  id: string;
  job_seeker_id: string;
  thread_status: string;
  last_reply_at: string | null;
  next_follow_up_at: string | null;
  ghosting_risk_score: number | null;
  recruiters:
    | {
        id: string;
        name: string | null;
        email: string | null;
        status: string;
        last_contacted_at: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        email: string | null;
        status: string;
        last_contacted_at: string | null;
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

export default async function FollowUpsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: assignments } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);

  const seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  if (seekerIds.length === 0) {
    return (
      <main>
        <h1>Follow-ups Due</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  const { data: threadRows } = await supabaseServer
    .from("recruiter_threads")
    .select(
      "id, job_seeker_id, thread_status, last_reply_at, next_follow_up_at, ghosting_risk_score, recruiters (id, name, email, status, last_contacted_at), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds);

  const rows = (threadRows ?? []) as ThreadRow[];
  const thresholdMs = 72 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const cutoff = nowMs - thresholdMs;

  const dueRows = rows.filter((row) => {
    if (row.thread_status === "FOLLOW_UP_DUE") {
      return true;
    }
    if (row.next_follow_up_at) {
      return new Date(row.next_follow_up_at).getTime() <= nowMs;
    }
    const recruiter = Array.isArray(row.recruiters)
      ? row.recruiters[0]
      : row.recruiters;
    if (!recruiter?.last_contacted_at) {
      return false;
    }
    return new Date(recruiter.last_contacted_at).getTime() <= cutoff;
  });

  return (
    <main>
      <h1>Follow-ups Due</h1>
      <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <a href="/dashboard/outreach/recruiters">Recruiters</a>
        <a href="/dashboard/outreach/follow-ups">Follow-ups Due</a>
        <a href="/dashboard/outreach/conversion">Conversion</a>
        <a href="/dashboard/outreach">Drafts</a>
      </nav>
      <p>Showing threads marked FOLLOW_UP_DUE, next_follow_up_at due, or no reply after 72 hours.</p>
      {dueRows.length === 0 ? (
        <p>No follow-ups due.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Recruiter</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Risk</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Last Contacted</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Thread</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Job Seeker</th>
            </tr>
          </thead>
          <tbody>
            {dueRows.map((row) => {
              const recruiter = Array.isArray(row.recruiters)
                ? row.recruiters[0]
                : row.recruiters;
              const seeker = Array.isArray(row.job_seekers)
                ? row.job_seekers[0]
                : row.job_seekers;
              return (
                <tr key={row.id}>
                  <td style={{ padding: "8px" }}>
                    {recruiter?.name ?? "Unknown"}{" "}
                    {recruiter?.email ? `(${recruiter.email})` : ""}
                  </td>
                  <td style={{ padding: "8px" }}>{row.thread_status}</td>
                  <td style={{ padding: "8px" }}>{row.ghosting_risk_score ?? 0}</td>
                  <td style={{ padding: "8px" }}>
                    {recruiter?.last_contacted_at
                      ? new Date(recruiter.last_contacted_at).toLocaleString()
                      : "-"}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <a href={`/dashboard/outreach/threads/${row.id}`}>View</a>
                  </td>
                  <td style={{ padding: "8px" }}>
                    {seeker?.full_name ?? "Job seeker"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
