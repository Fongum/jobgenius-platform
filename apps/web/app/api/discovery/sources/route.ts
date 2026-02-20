import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";

/**
 * GET /api/discovery/sources
 *
 * Returns all enabled job sources for scraping.
 */
export async function GET(request: Request) {
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

  const { data: sources, error } = await supabaseServer
    .from("job_sources")
    .select("*")
    .eq("enabled", true)
    .order("name");

  if (error) {
    return Response.json(
      { success: false, error: "Failed to fetch job sources." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    sources: sources ?? [],
  });
}
