import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/discovery/sources
 *
 * Returns all enabled job sources for scraping.
 */
export async function GET() {
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
