import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ConversationThread from "./ConversationThread";

export default async function ConversationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch conversation
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select(`
      *,
      account_managers ( name, email ),
      job_posts ( title, company )
    `)
    .eq("id", params.id)
    .eq("job_seeker_id", user.id)
    .single();

  if (!conversation) {
    redirect("/portal/conversations");
  }

  // Fetch messages
  const { data: messages } = await supabaseAdmin
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  // Mark AM messages as read
  await supabaseAdmin
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", params.id)
    .eq("sender_type", "account_manager")
    .is("read_at", null);

  return (
    <>
      <ConversationThread
        conversation={conversation}
        initialMessages={messages ?? []}
        userId={user.id}
      />
    </>
  );
}
