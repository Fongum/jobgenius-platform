import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";

/**
 * GET /api/discovery/searches/pending
 *
 * Returns searches that are due to run.
 * Used by the discovery agent to find work.
 */
export async function GET(request: Request) {
  // Verify ops API key for service-to-service calls
  const authResult = requireOpsAuth(request.headers);
  if (!authResult.ok) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Find searches where:
  // 1. enabled = true
  // 2. last_run_at is null OR last_run_at + run_frequency_hours < now
  const { data: searches, error } = await supabaseServer
    .from("job_discovery_searches")
    .select(`
      *,
      job_sources!inner (id, name, base_url, selectors, rate_limit_per_minute)
    `)
    .eq("enabled", true)
    .or(`last_run_at.is.null,last_run_at.lt.${new Date(Date.now() - 60 * 60 * 1000).toISOString()}`)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(10);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to fetch pending searches." },
      { status: 500 }
    );
  }

  // Filter by actual run frequency (SQL can't easily do interval math)
  const now = Date.now();
  const pendingSearches = (searches ?? []).filter((search) => {
    if (!search.last_run_at) return true;

    const lastRun = new Date(search.last_run_at).getTime();
    const frequencyMs = (search.run_frequency_hours ?? 24) * 60 * 60 * 1000;
    return now - lastRun >= frequencyMs;
  });

  // Transform to include source info at top level
  const transformed = pendingSearches.map((search) => ({
    id: search.id,
    job_seeker_id: search.job_seeker_id,
    source_id: search.job_sources?.name,
    search_name: search.search_name,
    search_url: search.search_url,
    keywords: search.keywords,
    location: search.location,
    filters: search.filters,
    enabled: search.enabled,
    last_run_at: search.last_run_at,
    run_frequency_hours: search.run_frequency_hours,
    source: search.job_sources,
  }));

  return Response.json({
    success: true,
    searches: transformed,
  });
}
