import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

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

export async function GET(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  const url = new URL(request.url);
  const requestedAccountManagerId = url.searchParams.get("account_manager_id");
  const hours = Math.max(Number(url.searchParams.get("hours") ?? "24"), 1);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let accountManagerId = requestedAccountManagerId;
  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
    accountManagerId = amResult.accountManager.id;
  }

  let metricsQuery = supabaseServer.from("v_outreach_am_metrics").select("*");
  let pipelineQuery = supabaseServer.from("v_outreach_pipeline_status").select("*");
  if (accountManagerId) {
    metricsQuery = metricsQuery.eq("account_manager_id", accountManagerId);
    pipelineQuery = pipelineQuery.eq("account_manager_id", accountManagerId);
  }

  const [{ data: metricsRows, error: metricsError }, { data: pipelineRows, error: pipelineError }] =
    await Promise.all([metricsQuery, pipelineQuery]);

  if (metricsError || pipelineError) {
    return Response.json(
      { success: false, error: "Failed to load outreach metrics." },
      { status: 500 }
    );
  }

  const { data: messageRows } = await supabaseServer
    .from("outreach_messages")
    .select("id, recruiter_thread_id, status, sent_at, opened_at, replied_at, bounced_at")
    .gte("created_at", since)
    .limit(1000);

  const telemetry = {
    sent: (messageRows ?? []).filter((row) => row.status === "SENT").length,
    opened: (messageRows ?? []).filter((row) => Boolean(row.opened_at)).length,
    replied: (messageRows ?? []).filter((row) => Boolean(row.replied_at)).length,
    bounced: (messageRows ?? []).filter((row) => Boolean(row.bounced_at)).length,
  };

  const pipelineMap = new Map<string, number>();
  (pipelineRows ?? []).forEach((row) => {
    pipelineMap.set(row.status, (pipelineMap.get(row.status) ?? 0) + (row.recruiter_count ?? 0));
  });

  let averageCompensation = 120000;
  let jobSeekerIds: string[] = [];
  if (accountManagerId) {
    const { data: assignments } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", accountManagerId);
    jobSeekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  } else {
    const { data: assignments } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .limit(10000);
    jobSeekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  }

  if (jobSeekerIds.length > 0) {
    const { data: salaryRows } = await supabaseServer
      .from("job_seekers")
      .select("salary_min, salary_max")
      .in("id", jobSeekerIds);

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

  return Response.json({
    success: true,
    account_manager_id: accountManagerId,
    metrics: metricsRows ?? [],
    pipeline: pipelineRows ?? [],
    telemetry,
    forecast: {
      weighted_expected_placements: weightedExpectedPlacements,
      average_compensation: averageCompensation,
      placement_fee_rate: placementFeeRate,
      expected_fee_per_placement: expectedPlacementFee,
      weighted_revenue_forecast: weightedRevenueForecast,
      stage_weights: STAGE_TO_PLACEMENT_PROBABILITY,
    },
    since,
  });
}
