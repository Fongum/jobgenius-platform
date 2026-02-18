import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: prep, error } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      *,
      job_posts ( title, company, description_text )
    `)
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (error || !prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  // Get videos
  const { data: videos } = await supabaseAdmin
    .from("interview_prep_videos")
    .select("*")
    .eq("interview_prep_id", params.id)
    .order("sort_order", { ascending: true });

  // Get practice sessions
  const { data: sessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("*")
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  return Response.json({
    prep,
    videos: videos ?? [],
    sessions: sessions ?? [],
  });
}
