import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

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
        title: string | null;
        company: string | null;
        email: string | null;
        status: string;
        last_contacted_at: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        title: string | null;
        company: string | null;
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

type PageProps = {
  searchParams?: { status?: string };
};

const statusOptions = ["NEW", "CONTACTED", "ENGAGED", "INTERVIEWING", "CLOSED"];

export default async function RecruitersPage({ searchParams }: PageProps) {
  const amEmail = getAmEmailFromHeaders();
  const statusFilter = searchParams?.status?.trim();

  if (!amEmail) {
    return (
      <main>
        <h1>Recruiters</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (!accountManager) {
    return (
      <main>
        <h1>Recruiters</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: assignments } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", accountManager.id);

  const seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  if (seekerIds.length === 0) {
    return (
      <main>
        <h1>Recruiters</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  const { data: threadRows } = await supabaseServer
    .from("recruiter_threads")
    .select(
      "id, job_seeker_id, thread_status, last_reply_at, next_follow_up_at, ghosting_risk_score, recruiters (id, name, title, company, email, status, last_contacted_at), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds);

  let rows = (threadRows ?? []) as ThreadRow[];
  if (statusFilter) {
    rows = rows.filter((row) => {
      const recruiter = Array.isArray(row.recruiters)
        ? row.recruiters[0]
        : row.recruiters;
      return recruiter?.status === statusFilter;
    });
  }

  return (
    <main>
      <h1>Recruiters</h1>
      <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <a href="/dashboard/outreach/recruiters">Recruiters</a>
        <a href="/dashboard/outreach/follow-ups">Follow-ups Due</a>
        <a href="/dashboard/outreach/conversion">Conversion</a>
        <a href="/dashboard/outreach">Drafts</a>
      </nav>
      <form method="get" style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <label>
          Status{" "}
          <select name="status" defaultValue={statusFilter ?? ""}>
            <option value="">All</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>

      {rows.length === 0 ? (
        <p>No recruiters yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Recruiter</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Company</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Risk</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Next Follow-up</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Thread</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Job Seeker</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
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
                  <td style={{ padding: "8px" }}>{recruiter?.company ?? "-"}</td>
                  <td style={{ padding: "8px" }}>{recruiter?.status ?? "-"}</td>
                  <td style={{ padding: "8px" }}>{row.ghosting_risk_score ?? 0}</td>
                  <td style={{ padding: "8px" }}>
                    {row.next_follow_up_at
                      ? new Date(row.next_follow_up_at).toLocaleString()
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
