import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

type JobSeekerRow = {
  id: string;
  full_name: string | null;
  location: string | null;
  seniority: string | null;
  target_titles: string[] | null;
  work_type: string | null;
};

type DecisionRow = {
  job_post_id: string;
  decision: string;
};

export default async function JobSeekersPage() {
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Job Seekers</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id, name, email")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return (
      <main>
        <h1>Job Seekers</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select(
      "job_seeker_id, job_seekers (id, full_name, location, seniority, target_titles, work_type)"
    )
    .eq("account_manager_id", accountManager.id);

  if (assignmentsError) {
    throw new Error("Failed to load job seeker assignments.");
  }

  const seekers = (assignments ?? []).flatMap((assignment) => {
    const seeker = assignment.job_seekers;
    if (!seeker) {
      return [];
    }
    return Array.isArray(seeker) ? seeker : [seeker];
  }) as JobSeekerRow[];

  const seekersWithCounts = await Promise.all(
    seekers.map(async (seeker) => {
      const { data: scores, error: scoresError } = await supabaseServer
        .from("job_match_scores")
        .select("job_post_id, score")
        .eq("job_seeker_id", seeker.id);

      if (scoresError) {
        throw new Error("Failed to load job match scores.");
      }

      const { data: decisions, error: decisionsError } = await supabaseServer
        .from("job_routing_decisions")
        .select("job_post_id, decision")
        .eq("job_seeker_id", seeker.id);

      if (decisionsError) {
        throw new Error("Failed to load routing decisions.");
      }

      const decisionMap = new Map(
        (decisions ?? []).map((decision) => [
          decision.job_post_id,
          decision.decision,
        ])
      );

      const recommendedCount =
        scores?.filter(
          (scoreRow) =>
            scoreRow.score >= 60 &&
            decisionMap.get(scoreRow.job_post_id) !== "OVERRIDDEN_OUT"
        ).length ?? 0;

      const belowCount =
        scores?.filter(
          (scoreRow) =>
            scoreRow.score < 60 &&
            decisionMap.get(scoreRow.job_post_id) !== "OVERRIDDEN_IN"
        ).length ?? 0;

      const overriddenInCount =
        (decisions ?? []).filter(
          (decision) => decision.decision === "OVERRIDDEN_IN"
        ).length ?? 0;

      const overriddenOutCount =
        (decisions ?? []).filter(
          (decision) => decision.decision === "OVERRIDDEN_OUT"
        ).length ?? 0;

      return {
        seeker,
        recommendedCount,
        belowCount,
        overriddenInCount,
        overriddenOutCount,
      };
    })
  );

  return (
    <main>
      <h1>Job Seekers</h1>
      <p>
        Account Manager: {accountManager.name ?? "Unknown"} ({amEmail})
      </p>
      <p>TODO: Replace AM email header with real auth.</p>
      {seekersWithCounts.length === 0 ? (
        <p>No job seekers assigned.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Location</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Seniority</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Target Titles
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Work Type</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Recommended
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Below</th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Overridden In
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>
                Overridden Out
              </th>
              <th style={{ textAlign: "left", padding: "8px" }}>Queue</th>
            </tr>
          </thead>
          <tbody>
            {seekersWithCounts.map((item) => (
              <tr key={item.seeker.id}>
                <td style={{ padding: "8px" }}>
                  {item.seeker.full_name ?? "Unnamed"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.location ?? "—"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.seniority ?? "—"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.target_titles?.join(", ") ?? "—"}
                </td>
                <td style={{ padding: "8px" }}>
                  {item.seeker.work_type ?? "—"}
                </td>
                <td style={{ padding: "8px" }}>{item.recommendedCount}</td>
                <td style={{ padding: "8px" }}>{item.belowCount}</td>
                <td style={{ padding: "8px" }}>{item.overriddenInCount}</td>
                <td style={{ padding: "8px" }}>{item.overriddenOutCount}</td>
                <td style={{ padding: "8px" }}>
                  <a href={`/dashboard/jobseekers/${item.seeker.id}/queue`}>
                    View Queue
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
