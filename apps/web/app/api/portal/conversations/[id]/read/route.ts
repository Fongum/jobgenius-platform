import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify ownership
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Mark all AM messages as read
  const { error } = await supabaseAdmin
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", params.id)
    .eq("sender_type", "account_manager")
    .is("read_at", null);

  if (error) {
    return Response.json({ error: "Failed to mark as read." }, { status: 500 });
  }

  return Response.json({ success: true });
}
