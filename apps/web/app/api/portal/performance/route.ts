import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.user.id;

  // Get interview results for this job seeker
  const { data: results } = await supabaseAdmin
    .from("interview_results")
    .select("*")
    .eq("job_seeker_id", userId)
    .order("created_at", { ascending: false });

  const myResults = results ?? [];

  // Compute stats
  const totalInterviews = myResults.length;
  const passedCount = myResults.filter((r: Record<string, unknown>) =>
    ["passed", "advanced", "offer"].includes(r.outcome as string)
  ).length;
  const offersCount = myResults.filter(
    (r: Record<string, unknown>) => r.outcome === "offer"
  ).length;
  const failedCount = myResults.filter(
    (r: Record<string, unknown>) => r.outcome === "failed" || r.outcome === "rejected"
  ).length;
  const pendingCount = myResults.filter(
    (r: Record<string, unknown>) => r.outcome === "pending"
  ).length;
  const passRate =
    totalInterviews > 0 ? Math.round((passedCount / totalInterviews) * 100) : 0;

  // Compute ranking among all job seekers using a window function approach
  // We calculate each seeker's success rate and then find where this user ranks
  let percentile = 0;

  if (totalInterviews > 0) {
    // Get all seekers' success rates
    const { data: allResults } = await supabaseAdmin
      .from("interview_results")
      .select("job_seeker_id, outcome");

    if (allResults && allResults.length > 0) {
      // Calculate success rate per seeker
      const seekerStats = new Map<string, { success: number; total: number }>();
      for (const r of allResults) {
        const sid = r.job_seeker_id as string;
        if (!seekerStats.has(sid)) {
          seekerStats.set(sid, { success: 0, total: 0 });
        }
        const stats = seekerStats.get(sid)!;
        stats.total++;
        if (["passed", "advanced", "offer"].includes(r.outcome as string)) {
          stats.success++;
        }
      }

      const rates = Array.from(seekerStats.entries()).map(([sid, stats]) => ({
        seekerId: sid,
        rate: stats.total > 0 ? stats.success / stats.total : 0,
      }));

      // Sort by rate ascending
      rates.sort((a, b) => a.rate - b.rate);

      const myIndex = rates.findIndex((r) => r.seekerId === userId);
      if (myIndex >= 0 && rates.length > 1) {
        percentile = Math.round((myIndex / (rates.length - 1)) * 100);
      } else if (rates.length === 1) {
        percentile = 100;
      }
    }
  }

  // Get practice session stats
  const { data: practiceSessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("id, overall_score, status, created_at, session_type")
    .eq("job_seeker_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(10);

  // Outcome breakdown
  const outcomeBreakdown = {
    passed: passedCount,
    failed: failedCount,
    offers: offersCount,
    pending: pendingCount,
    advanced: myResults.filter(
      (r: Record<string, unknown>) => r.outcome === "advanced"
    ).length,
    rejected: myResults.filter(
      (r: Record<string, unknown>) => r.outcome === "rejected"
    ).length,
  };

  return Response.json({
    stats: {
      total_interviews: totalInterviews,
      pass_rate: passRate,
      offers: offersCount,
      percentile,
    },
    outcome_breakdown: outcomeBreakdown,
    practice_sessions: practiceSessions ?? [],
    recent_results: myResults.slice(0, 10),
  });
}
