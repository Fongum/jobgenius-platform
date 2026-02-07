import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import PerformanceClient from "./PerformanceClient";

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Get interview results
  const { data: results } = await supabaseAdmin
    .from("interview_results")
    .select("*")
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false });

  const myResults = results ?? [];

  const totalInterviews = myResults.length;
  const passedCount = myResults.filter((r: Record<string, unknown>) =>
    ["passed", "advanced", "offer"].includes(r.outcome as string)
  ).length;
  const offersCount = myResults.filter(
    (r: Record<string, unknown>) => r.outcome === "offer"
  ).length;
  const failedCount = myResults.filter(
    (r: Record<string, unknown>) =>
      r.outcome === "failed" || r.outcome === "rejected"
  ).length;
  const passRate =
    totalInterviews > 0
      ? Math.round((passedCount / totalInterviews) * 100)
      : 0;

  // Compute percentile ranking
  let percentile = 0;
  if (totalInterviews > 0) {
    const { data: allResults } = await supabaseAdmin
      .from("interview_results")
      .select("job_seeker_id, outcome");

    if (allResults && allResults.length > 0) {
      const seekerStats = new Map<
        string,
        { success: number; total: number }
      >();
      for (const r of allResults) {
        const sid = r.job_seeker_id as string;
        if (!seekerStats.has(sid)) {
          seekerStats.set(sid, { success: 0, total: 0 });
        }
        const stats = seekerStats.get(sid)!;
        stats.total++;
        if (
          ["passed", "advanced", "offer"].includes(r.outcome as string)
        ) {
          stats.success++;
        }
      }

      const rates = Array.from(seekerStats.entries()).map(
        ([sid, stats]) => ({
          seekerId: sid,
          rate: stats.total > 0 ? stats.success / stats.total : 0,
        })
      );
      rates.sort((a, b) => a.rate - b.rate);

      const myIndex = rates.findIndex((r) => r.seekerId === user.id);
      if (myIndex >= 0 && rates.length > 1) {
        percentile = Math.round((myIndex / (rates.length - 1)) * 100);
      } else if (rates.length === 1) {
        percentile = 100;
      }
    }
  }

  // Get practice session scores
  const { data: practiceSessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("id, overall_score, status, created_at")
    .eq("job_seeker_id", user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Performance & Ranking
      </h2>
      <PerformanceClient
        stats={{
          totalInterviews,
          passRate,
          offers: offersCount,
          percentile,
          passed: passedCount,
          failed: failedCount,
        }}
        practiceSessions={practiceSessions ?? []}
        recentResults={myResults.slice(0, 10)}
      />
    </>
  );
}
