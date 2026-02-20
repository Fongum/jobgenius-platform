import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";

/**
 * GET /api/discovery/sources/[name]
 *
 * Returns a specific job source by name.
 */
export async function GET(
  request: Request,
  context: { params: { name: string } }
) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }
  }

  const sourceName = context.params.name;

  const { data: source, error } = await supabaseServer
    .from("job_sources")
    .select("*")
    .eq("name", sourceName)
    .single();

  if (error || !source) {
    return Response.json(
      { success: false, error: "Job source not found." },
      { status: 404 }
    );
  }

  return Response.json({
    success: true,
    source,
  });
}
