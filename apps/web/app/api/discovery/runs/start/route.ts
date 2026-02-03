import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";

type StartRunPayload = {
  search_id: string;
};

/**
 * POST /api/discovery/runs/start
 *
 * Starts a new discovery run for a search.
 */
export async function POST(request: Request) {
  const authResult = requireOpsAuth(request.headers);
  if (!authResult.ok) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let payload: StartRunPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload.search_id) {
    return Response.json(
      { success: false, error: "Missing search_id." },
      { status: 400 }
    );
  }

  // Get the search to verify it exists and get source name
  const { data: search, error: searchError } = await supabaseServer
    .from("job_discovery_searches")
    .select(`
      id,
      job_sources (name)
    `)
    .eq("id", payload.search_id)
    .single();

  if (searchError || !search) {
    return Response.json(
      { success: false, error: "Search not found." },
      { status: 404 }
    );
  }

  const jobSources = search.job_sources as { name: string } | { name: string }[] | null;
  const sourceName = Array.isArray(jobSources)
    ? jobSources[0]?.name
    : jobSources?.name;

  // Create the run record
  const { data: run, error } = await supabaseServer
    .from("job_discovery_runs")
    .insert({
      search_id: payload.search_id,
      source_name: sourceName ?? "unknown",
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return Response.json(
      { success: false, error: "Failed to create run." },
      { status: 500 }
    );
  }

  // Update last_run_at on the search
  await supabaseServer
    .from("job_discovery_searches")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", payload.search_id);

  return Response.json({
    success: true,
    run_id: run.id,
  });
}
