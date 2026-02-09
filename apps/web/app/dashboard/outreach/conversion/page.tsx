import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type MetricsRow = {
  account_manager_id: string;
  recruiters_contacted: number;
  threads_total: number;
  replied_threads: number;
  reply_rate: number;
  positive_replies: number;
  positive_reply_pct: number;
  interviewing_threads: number;
  interview_conversion_rate: number;
  offer_threads: number;
  avg_hours_to_offer: number | null;
  avg_ghosting_risk: number | null;
};

type PipelineRow = {
  status: string;
  recruiter_count: number;
};

type RiskRow = {
  id: string;
  ghosting_risk_score: number | null;
  next_follow_up_at: string | null;
  recruiters:
    | {
        name: string | null;
        company: string | null;
        status: string;
      }
    | Array<{
        name: string | null;
        company: string | null;
        status: string;
      }>
    | null;
};

const STAGE_TO_PLACEMENT_PROBABILITY: Record<string, number> = {
  NEW: 0.01,
  CONTACTED: 0.03,
  ENGAGED: 0.12,
  INTERVIEWING: 0.35,
  CLOSED: 0,
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default async function OutreachConversionPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: metricsData } = await supabaseServer
    .from("v_outreach_am_metrics")
    .select("*")
    .eq("account_manager_id", user.id)
    .maybeSingle();

  const metrics = (metricsData as MetricsRow | null) ?? {
    account_manager_id: user.id,
    recruiters_contacted: 0,
    threads_total: 0,
    replied_threads: 0,
    reply_rate: 0,
    positive_replies: 0,
    positive_reply_pct: 0,
    interviewing_threads: 0,
    interview_conversion_rate: 0,
    offer_threads: 0,
    avg_hours_to_offer: null,
    avg_ghosting_risk: null,
  };

  const { data: pipelineRows } = await supabaseServer
    .from("v_outreach_pipeline_status")
    .select("status, recruiter_count")
    .eq("account_manager_id", user.id);

  const pipelineMap = new Map<string, number>();
  for (const row of (pipelineRows ?? []) as PipelineRow[]) {
    pipelineMap.set(row.status, row.recruiter_count);
  }

  const { data: assignments } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);

  const seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  let averageCompensation = 120000;
  if (seekerIds.length > 0) {
    const { data: salaryRows } = await supabaseServer
      .from("job_seekers")
      .select("salary_min, salary_max")
      .in("id", seekerIds);

    const comps = (salaryRows ?? []).map((row) => {
      const salaryMin =
        typeof row.salary_min === "number" && row.salary_min > 0
          ? row.salary_min
          : null;
      const salaryMax =
        typeof row.salary_max === "number" && row.salary_max > 0
          ? row.salary_max
          : null;

      if (salaryMin && salaryMax) {
        return (salaryMin + salaryMax) / 2;
      }
      if (salaryMax) {
        return salaryMax;
      }
      if (salaryMin) {
        return salaryMin;
      }
      return 120000;
    });

    averageCompensation = comps.length > 0 ? average(comps) : 120000;
  }

  const weightedExpectedPlacements = ["NEW", "CONTACTED", "ENGAGED", "INTERVIEWING"].reduce(
    (sum, status) => {
      const count = pipelineMap.get(status) ?? 0;
      const weight = STAGE_TO_PLACEMENT_PROBABILITY[status] ?? 0;
      return sum + count * weight;
    },
    0
  );

  const placementFeeRate = 0.04;
  const expectedPlacementFee = averageCompensation * placementFeeRate;
  const weightedRevenueForecast = weightedExpectedPlacements * expectedPlacementFee;
  const forecastConfidence =
    metrics.threads_total >= 20 ? "HIGH" : metrics.threads_total >= 8 ? "MEDIUM" : "LOW";

  let riskRows: RiskRow[] = [];
  if (seekerIds.length > 0) {
    const { data } = await supabaseServer
      .from("recruiter_threads")
      .select("id, ghosting_risk_score, next_follow_up_at, recruiters (name, company, status)")
      .in("job_seeker_id", seekerIds)
      .order("ghosting_risk_score", { ascending: false })
      .limit(10);
    riskRows = (data ?? []) as RiskRow[];
  }

  return (
    <main style={{ display: "grid", gap: "16px" }}>
      <header>
        <h1>Outreach Conversion</h1>
        <p>Account Manager: {user.name ?? user.email}</p>
        <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <a href="/dashboard/outreach/recruiters">Recruiters</a>
          <a href="/dashboard/outreach/follow-ups">Follow-ups Due</a>
          <a href="/dashboard/outreach/conversion">Conversion</a>
          <a href="/dashboard/outreach">Drafts</a>
        </nav>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "10px",
        }}
      >
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Recruiters Contacted</strong>
          <div>{metrics.recruiters_contacted}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Reply Rate</strong>
          <div>{(metrics.reply_rate * 100).toFixed(1)}%</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Positive Reply %</strong>
          <div>{(metrics.positive_reply_pct * 100).toFixed(1)}%</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Interview Conversion</strong>
          <div>{(metrics.interview_conversion_rate * 100).toFixed(1)}%</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Offers</strong>
          <div>{metrics.offer_threads}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Avg Time To Offer</strong>
          <div>
            {metrics.avg_hours_to_offer == null
              ? "-"
              : `${metrics.avg_hours_to_offer.toFixed(1)} hours`}
          </div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
          <strong>Avg Ghosting Risk</strong>
          <div>
            {metrics.avg_ghosting_risk == null
              ? "-"
              : Number(metrics.avg_ghosting_risk).toFixed(1)}
          </div>
        </div>
      </section>

      <section>
        <h3>Placement Pipeline</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Recruiter Status</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {["NEW", "CONTACTED", "ENGAGED", "INTERVIEWING", "CLOSED"].map((status) => (
              <tr key={status}>
                <td style={{ padding: "8px" }}>{status}</td>
                <td style={{ padding: "8px" }}>{pipelineMap.get(status) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
        <h3 style={{ marginTop: 0 }}>Revenue Forecast (Weighted Pipeline)</h3>
        <p style={{ marginTop: 0 }}>
          Uses stage-weighted conversion assumptions and a 4% placement fee.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "10px",
          }}
        >
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
            <strong>Expected Placements</strong>
            <div>{weightedExpectedPlacements.toFixed(2)}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
            <strong>Avg Compensation Basis</strong>
            <div>${averageCompensation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
            <strong>Expected Fee / Placement (4%)</strong>
            <div>${expectedPlacementFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
            <strong>Weighted Forecast Revenue</strong>
            <div>${weightedRevenueForecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
            <strong>Forecast Confidence</strong>
            <div>{forecastConfidence}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Stage</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Count</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Placement Weight</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Weighted Placements</th>
            </tr>
          </thead>
          <tbody>
            {["NEW", "CONTACTED", "ENGAGED", "INTERVIEWING"].map((status) => {
              const count = pipelineMap.get(status) ?? 0;
              const weight = STAGE_TO_PLACEMENT_PROBABILITY[status] ?? 0;
              return (
                <tr key={`forecast-${status}`}>
                  <td style={{ padding: "8px" }}>{status}</td>
                  <td style={{ padding: "8px" }}>{count}</td>
                  <td style={{ padding: "8px" }}>{(weight * 100).toFixed(1)}%</td>
                  <td style={{ padding: "8px" }}>{(count * weight).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Ghosting Risk Watchlist</h3>
        {riskRows.length === 0 ? (
          <p>No outreach threads yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px" }}>Recruiter</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Risk</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Next Follow-up</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Thread</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((row) => {
                const recruiter = Array.isArray(row.recruiters) ? row.recruiters[0] : row.recruiters;
                return (
                  <tr key={row.id}>
                    <td style={{ padding: "8px" }}>
                      {recruiter?.name ?? "Unknown"} {recruiter?.company ? `(${recruiter.company})` : ""}
                    </td>
                    <td style={{ padding: "8px" }}>{recruiter?.status ?? "-"}</td>
                    <td style={{ padding: "8px" }}>{row.ghosting_risk_score ?? 0}</td>
                    <td style={{ padding: "8px" }}>
                      {row.next_follow_up_at
                        ? new Date(row.next_follow_up_at).toLocaleString()
                        : "Not scheduled"}
                    </td>
                    <td style={{ padding: "8px" }}>
                      <a href={`/dashboard/outreach/threads/${row.id}`}>View</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
