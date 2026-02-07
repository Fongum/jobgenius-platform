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

  const { data: conversation, error } = await supabaseAdmin
    .from("conversations")
    .select(`
      *,
      account_managers ( name, email ),
      job_posts ( title, company )
    `)
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (error || !conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  return Response.json({ conversation });
}
