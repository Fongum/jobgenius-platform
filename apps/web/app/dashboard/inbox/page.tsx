import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import InboxClient from "./InboxClient";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role || (!isAdminRole(user.role) && user.role !== "am")) {
    redirect("/dashboard");
  }

  const amId = user.id;

  // Load all conversations for this AM's seekers
  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      subject,
      conversation_type,
      status,
      updated_at,
      job_seeker_id,
      job_seekers!inner(id, full_name, profile_photo_url)
    `)
    .eq("account_manager_id", amId)
    .eq("status", "open")
    .order("updated_at", { ascending: false });

  if (!conversations || conversations.length === 0) {
    return <InboxClient initialConversations={[]} />;
  }

  const convIds = conversations.map((c) => c.id);

  const [{ data: latestMsgs }, { data: unreadCounts }] = await Promise.all([
    supabaseAdmin
      .from("conversation_messages")
      .select("conversation_id, content, sender_type, created_at, message_type")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("conversation_messages")
      .select("conversation_id")
      .in("conversation_id", convIds)
      .eq("sender_type", "job_seeker")
      .is("read_at", null),
  ]);

  const latestMap = new Map<string, { content: string; sender_type: string; created_at: string; message_type: string }>();
  for (const msg of (latestMsgs ?? [])) {
    if (!latestMap.has(msg.conversation_id)) {
      latestMap.set(msg.conversation_id, {
        content: msg.content,
        sender_type: msg.sender_type,
        created_at: msg.created_at,
        message_type: msg.message_type,
      });
    }
  }

  const unreadMap = new Map<string, number>();
  for (const msg of (unreadCounts ?? [])) {
    unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) ?? 0) + 1);
  }

  const initialConversations = conversations.map((conv) => {
    const seeker = conv.job_seekers as unknown as { id: string; full_name: string | null; profile_photo_url: string | null } | null;
    const latest = latestMap.get(conv.id);
    return {
      id: conv.id,
      subject: conv.subject,
      conversation_type: conv.conversation_type,
      updated_at: conv.updated_at,
      seeker_id: conv.job_seeker_id,
      seeker_name: seeker?.full_name ?? "Unknown",
      seeker_photo: seeker?.profile_photo_url ?? null,
      unread_count: unreadMap.get(conv.id) ?? 0,
      latest_message: latest
        ? {
            content: latest.content.slice(0, 120),
            sender_type: latest.sender_type,
            created_at: latest.created_at,
            message_type: latest.message_type,
          }
        : null,
    };
  });

  return <InboxClient initialConversations={initialConversations} />;
}
