import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // 'general' or 'application_question'

  let query = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      account_managers ( name, email ),
      job_posts ( title, company ),
      conversation_messages ( id, content, sender_type, read_at, created_at )
    `)
    .eq("job_seeker_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (type === "general" || type === "application_question") {
    query = query.eq("conversation_type", type);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: "Failed to fetch conversations." }, { status: 500 });
  }

  // Compute unread counts and last message per conversation
  const conversations = (data ?? []).map((conv: Record<string, unknown>) => {
    const messages = (conv.conversation_messages as Array<Record<string, unknown>>) ?? [];
    const unreadCount = messages.filter(
      (m) => m.sender_type === "account_manager" && m.read_at === null
    ).length;
    const lastMessage = messages.length > 0
      ? messages.sort(
          (a, b) =>
            new Date(b.created_at as string).getTime() -
            new Date(a.created_at as string).getTime()
        )[0]
      : null;

    // Remove full messages array from response
    const { conversation_messages: _, ...rest } = conv;
    return {
      ...rest,
      unread_count: unreadCount,
      last_message: lastMessage
        ? {
            content: (lastMessage.content as string).slice(0, 120),
            sender_type: lastMessage.sender_type,
            created_at: lastMessage.created_at,
          }
        : null,
    };
  });

  return Response.json({ conversations });
}
