import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { hasOpenTask } from "@/lib/conversations/tasks";

// GET /api/portal/notifications
// Returns unread message counts + open task count + recent unread conversations
// for the portal notification bell panel.
export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: conversations, error: conversationsError } = await supabaseAdmin
    .from("conversations")
    .select("id, subject, conversation_type, updated_at, account_manager_id")
    .eq("job_seeker_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (conversationsError) {
    return Response.json(
      { error: "Failed to load notification counts." },
      { status: 500 }
    );
  }

  const conversationIds = (conversations ?? []).map((c) => c.id);

  if (conversationIds.length === 0) {
    return Response.json({
      unread_messages: 0,
      open_tasks: 0,
      recent_unread: [],
    });
  }

  // Fetch unread announcements for this seeker in parallel with message queries
  const [
    { count: unreadCount },
    { data: amMessages, error: taskError },
    { data: unreadMessages },
    { data: allAnnouncements },
  ] = await Promise.all([
    // Total unread count
    supabaseAdmin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("sender_type", "account_manager")
      .in("conversation_id", conversationIds),
    // All AM messages (for open task detection)
    supabaseAdmin
      .from("conversation_messages")
      .select("attachments")
      .eq("sender_type", "account_manager")
      .in("conversation_id", conversationIds),
    // Recent unread AM messages for the notification panel
    supabaseAdmin
      .from("conversation_messages")
      .select("conversation_id, content, created_at")
      .is("read_at", null)
      .eq("sender_type", "account_manager")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
    // Unread announcements targeting seekers or all users
    supabaseAdmin
      .from("system_announcements")
      .select("id, subject, body, sent_at")
      .eq("status", "sent")
      .in("target_audience", ["all_job_seekers", "all_users"])
      .order("sent_at", { ascending: false })
      .limit(10),
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

  // Build recent_unread: one entry per conversation, up to 5
  const seenConvIds = new Set<string>();
  const recentUnread: {
    conversation_id: string;
    subject: string;
    preview: string;
    conversation_type: string;
    updated_at: string;
  }[] = [];

  for (const msg of (unreadMessages ?? [])) {
    if (seenConvIds.has(msg.conversation_id)) continue;
    seenConvIds.add(msg.conversation_id);

    const conv = (conversations ?? []).find((c) => c.id === msg.conversation_id);
    if (!conv) continue;

    recentUnread.push({
      conversation_id: msg.conversation_id,
      subject: conv.subject,
      preview: msg.content.slice(0, 120),
      conversation_type: conv.conversation_type,
      updated_at: conv.updated_at,
    });

    if (recentUnread.length >= 5) break;
  }

  // Filter announcements to those not yet read by this seeker
  const unreadAnnouncements: { id: string; subject: string; body: string; sent_at: string }[] = [];
  if ((allAnnouncements ?? []).length > 0) {
    const announcementIds = (allAnnouncements ?? []).map((a) => a.id);
    const { data: readIds } = await supabaseAdmin
      .from("announcement_reads")
      .select("announcement_id")
      .eq("reader_type", "job_seeker")
      .eq("reader_id", auth.user.id)
      .in("announcement_id", announcementIds);

    const readSet = new Set((readIds ?? []).map((r) => r.announcement_id));
    for (const a of (allAnnouncements ?? [])) {
      if (!readSet.has(a.id)) {
        unreadAnnouncements.push({ id: a.id, subject: a.subject, body: a.body, sent_at: a.sent_at });
      }
    }
  }

  return Response.json({
    unread_messages: unreadCount ?? 0,
    open_tasks: openTasks,
    recent_unread: recentUnread,
    unread_announcements: unreadAnnouncements,
  });
}
