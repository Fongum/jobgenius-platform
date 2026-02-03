import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/discovery/sources/[name]
 *
 * Returns a specific job source by name.
 */
export async function GET(
  request: Request,
  context: { params: { name: string } }
) {
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
