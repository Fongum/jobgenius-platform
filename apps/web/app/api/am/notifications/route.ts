import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

// GET /api/am/notifications
// Returns unread seeker message count + recent conversations with unread messages.
// Used by the AM dashboard shell to drive the notification bell.
export async function GET(req: NextRequest) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const amId = auth.user.id;

  // Get all conversations for this AM's assigned seekers
  const { data: conversations, error: convErr } = await supabaseAdmin
    .from("conversations")
    .select("id, subject, conversation_type, updated_at, job_seeker_id, job_seekers!inner(full_name)")
    .eq("account_manager_id", amId)
    .eq("status", "open")
    .order("updated_at", { ascending: false });

  if (convErr) {
    return NextResponse.json({ unread_messages: 0, recent_unread: [] });
  }

  const allConvIds = (conversations ?? []).map((c) => c.id);

  if (allConvIds.length === 0) {
    return NextResponse.json({ unread_messages: 0, recent_unread: [], unread_announcements: [] });
  }

  // Count unread seeker messages + fetch unread announcements for AMs
  const [{ count: unreadCount }, { data: unreadMessages }, { data: allAnnouncements }] = await Promise.all([
    supabaseAdmin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("sender_type", "job_seeker")
      .in("conversation_id", allConvIds),
    // Get conversation IDs that have unread messages (for the panel list)
    supabaseAdmin
      .from("conversation_messages")
      .select("conversation_id, content, created_at")
      .is("read_at", null)
      .eq("sender_type", "job_seeker")
      .in("conversation_id", allConvIds)
      .order("created_at", { ascending: false }),
    // Unread announcements targeting AMs or all users
    supabaseAdmin
      .from("system_announcements")
      .select("id, subject, body, sent_at")
      .eq("status", "sent")
      .in("target_audience", ["all_account_managers", "all_users"])
      .order("sent_at", { ascending: false })
      .limit(10),
  ]);

  // Build a deduplicated list of conversations with unread messages
  const seenConvIds = new Set<string>();
  const recentUnread: {
    conversation_id: string;
    seeker_id: string;
    subject: string;
    seeker_name: string | null;
    preview: string;
    conversation_type: string;
    updated_at: string;
  }[] = [];

  for (const msg of (unreadMessages ?? [])) {
    if (seenConvIds.has(msg.conversation_id)) continue;
    seenConvIds.add(msg.conversation_id);

    const conv = (conversations ?? []).find((c) => c.id === msg.conversation_id);
    if (!conv) continue;

    const seeker = conv.job_seekers as unknown as { full_name: string | null } | null;

    recentUnread.push({
      conversation_id: msg.conversation_id,
      seeker_id: conv.job_seeker_id,
      subject: conv.subject,
      seeker_name: seeker?.full_name ?? null,
      preview: msg.content.slice(0, 120),
      conversation_type: conv.conversation_type,
      updated_at: conv.updated_at,
    });

    if (recentUnread.length >= 5) break;
  }

  // Filter announcements to those not yet read by this AM
  const unreadAnnouncements: { id: string; subject: string; body: string; sent_at: string }[] = [];
  if ((allAnnouncements ?? []).length > 0) {
    const announcementIds = (allAnnouncements ?? []).map((a) => a.id);
    const { data: readIds } = await supabaseAdmin
      .from("announcement_reads")
      .select("announcement_id")
      .eq("reader_type", "account_manager")
      .eq("reader_id", amId)
      .in("announcement_id", announcementIds);

    const readSet = new Set((readIds ?? []).map((r) => r.announcement_id));
    for (const a of (allAnnouncements ?? [])) {
      if (!readSet.has(a.id)) {
        unreadAnnouncements.push({ id: a.id, subject: a.subject, body: a.body, sent_at: a.sent_at });
      }
    }
  }

  return NextResponse.json({
    unread_messages: unreadCount ?? 0,
    recent_unread: recentUnread,
    unread_announcements: unreadAnnouncements,
  });
}
