import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ConversationsClient from "./ConversationsClient";

export default async function ConversationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch all conversations with last message info
  const { data: rawConversations } = await supabaseAdmin
    .from("conversations")
    .select(`
      *,
      account_managers ( name, email ),
      job_posts ( title, company ),
      conversation_messages ( id, content, sender_type, read_at, created_at )
    `)
    .eq("job_seeker_id", user.id)
    .order("updated_at", { ascending: false });

  type Conversation = {
    id: string;
    conversation_type: "general" | "application_question";
    subject: string;
    status: string;
    created_at: string;
    updated_at: string;
    account_managers: { name: string; email: string } | null;
    job_posts: { title: string; company: string | null } | null;
    unread_count: number;
    last_message: {
      content: string;
      sender_type: string;
      created_at: string;
    } | null;
  };

  const conversations: Conversation[] = (rawConversations ?? []).map(
    (conv: Record<string, unknown>) => {
      const messages =
        (conv.conversation_messages as Array<Record<string, unknown>>) ?? [];
      const unreadCount = messages.filter(
        (m) => m.sender_type === "account_manager" && m.read_at === null
      ).length;
      const sorted = [...messages].sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
      const lastMessage = sorted[0] ?? null;

      return {
        id: conv.id as string,
        conversation_type: conv.conversation_type as "general" | "application_question",
        subject: conv.subject as string,
        status: conv.status as string,
        created_at: conv.created_at as string,
        updated_at: conv.updated_at as string,
        account_managers: conv.account_managers as { name: string; email: string } | null,
        job_posts: conv.job_posts as { title: string; company: string | null } | null,
        unread_count: unreadCount,
        last_message: lastMessage
          ? {
              content: (lastMessage.content as string).slice(0, 120),
              sender_type: lastMessage.sender_type as string,
              created_at: lastMessage.created_at as string,
            }
          : null,
      };
    }
  );

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Questions & Tasks
      </h2>
      <ConversationsClient conversations={conversations} />
    </>
  );
}
