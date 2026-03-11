import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET: Fetch outreach messages with AI draft replies
 * POST: Send or dismiss a draft reply
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const seekerId = searchParams.get("job_seeker_id");
  const status = searchParams.get("status") ?? "generated";

  let query = supabaseAdmin
    .from("outreach_messages")
    .select(`
      id, subject, body, direction, reply_classification, ai_draft_reply, ai_draft_status, created_at,
      outreach_threads (
        id, job_seeker_id,
        outreach_recruiters (id, name, company, email)
      )
    `)
    .eq("direction", "inbound")
    .eq("ai_draft_status", status)
    .order("created_at", { ascending: false })
    .limit(50);

  if (seekerId) {
    query = query.eq("outreach_threads.job_seeker_id", seekerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drafts: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { message_id, action, edited_reply } = body;

  if (!message_id || !action) {
    return NextResponse.json({ error: "message_id and action required" }, { status: 400 });
  }

  if (action === "dismiss") {
    const { error: dismissError } = await supabaseAdmin
      .from("outreach_messages")
      .update({ ai_draft_status: "dismissed" })
      .eq("id", message_id);

    if (dismissError) {
      console.error("[outreach:reply-draft] failed to dismiss draft:", dismissError);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "send") {
    // Get the draft
    const { data: msg } = await supabaseAdmin
      .from("outreach_messages")
      .select("id, ai_draft_reply, outreach_thread_id")
      .eq("id", message_id)
      .single();

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const replyText = edited_reply ?? msg.ai_draft_reply;
    if (!replyText) {
      return NextResponse.json({ error: "No draft to send" }, { status: 400 });
    }

    // Create outbound reply message
    const { error: insertErr } = await supabaseAdmin
      .from("outreach_messages")
      .insert({
        outreach_thread_id: msg.outreach_thread_id,
        direction: "outbound",
        subject: "Re: (reply)",
        body: replyText,
        sent_at: new Date().toISOString(),
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Mark draft as sent
    const { error: markSentError } = await supabaseAdmin
      .from("outreach_messages")
      .update({ ai_draft_status: "sent" })
      .eq("id", message_id);

    if (markSentError) {
      console.error("[outreach:reply-draft] failed to mark draft as sent:", markSentError);
    }

    return NextResponse.json({ ok: true, sent: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
