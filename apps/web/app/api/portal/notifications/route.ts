import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { hasOpenTask } from "@/lib/conversations/tasks";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: conversations, error: conversationsError } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("job_seeker_id", auth.user.id);

  if (conversationsError) {
    return Response.json(
      { error: "Failed to load notification counts." },
      { status: 500 }
    );
  }

  const conversationIds = (conversations ?? []).map(
    (conversation: { id: string }) => conversation.id
  );
  if (conversationIds.length === 0) {
    return Response.json({
      unread_messages: 0,
      open_tasks: 0,
    });
  }

  const [{ count: unreadCount }, { data: amMessages, error: taskError }] =
    await Promise.all([
      supabaseAdmin
        .from("conversation_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .eq("sender_type", "account_manager")
        .in("conversation_id", conversationIds),
      supabaseAdmin
        .from("conversation_messages")
        .select("attachments")
        .eq("sender_type", "account_manager")
        .in("conversation_id", conversationIds),
    ]);

  if (taskError) {
    return Response.json(
      { error: "Failed to load task notifications." },
      { status: 500 }
    );
  }

  const openTasks = (amMessages ?? []).filter((message: { attachments: unknown }) =>
    hasOpenTask(message.attachments)
  ).length;

  return Response.json({
    unread_messages: unreadCount ?? 0,
    open_tasks: openTasks,
  });
}
