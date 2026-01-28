import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", amResult.accountManager.id);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seeker assignments." },
      { status: 500 }
    );
  }

  const seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  if (seekerIds.length === 0) {
    return Response.json({ success: true, items: [] });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  let query = supabaseServer
    .from("application_queue")
    .select(
      "id, job_seeker_id, job_post_id, status, category, last_error, created_at, updated_at, job_posts (title, company, location), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data: queueRows, error: queueError } = await query;

  if (queueError) {
    return Response.json(
      { success: false, error: "Failed to load application queue." },
      { status: 500 }
    );
  }

  const queueItems = queueRows ?? [];
  const queueIds = queueItems.map((item) => item.id);

  let runs: Array<{
    id: string;
    queue_id: string;
    ats_type: string;
    status: string;
    current_step: string;
    last_error_code: string | null;
    last_error: string | null;
    needs_attention_reason: string | null;
    updated_at: string;
  }> = [];

  if (queueIds.length > 0) {
    const { data: runRows, error: runsError } = await supabaseServer
      .from("application_runs")
      .select("id, queue_id, ats_type, status, current_step, last_error_code, last_error, needs_attention_reason, updated_at")
      .in("queue_id", queueIds);

    if (runsError) {
      return Response.json(
        { success: false, error: "Failed to load application runs." },
        { status: 500 }
      );
    }

    runs = (runRows ?? []) as typeof runs;
  }

  const runMap = new Map(runs.map((run) => [run.queue_id, run]));

  const items = queueItems.map((item) => ({
    ...item,
    run: runMap.get(item.id) ?? null,
  }));

  return Response.json({ success: true, items });
}
