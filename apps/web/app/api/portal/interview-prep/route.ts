import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      *,
      job_posts ( title, company )
    `)
    .eq("job_seeker_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch interview preps." }, { status: 500 });
  }

  return Response.json({ preps: data ?? [] });
}
