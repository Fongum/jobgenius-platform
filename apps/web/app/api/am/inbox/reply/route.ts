import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { GmailClient } from "@/lib/gmail/client";

/**
 * POST /api/am/inbox/reply
 * AM replies to an inbound email on behalf of a job seeker.
 * Body: { email_id: string, body: string }
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: { email_id?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.email_id || !payload.body?.trim()) {
    return NextResponse.json(
      { error: "Missing email_id or body" },
      { status: 400 }
    );
  }

  // Get the inbound email
  const { data: email, error: emailError } = await supabaseAdmin
    .from("inbound_emails")
    .select(
      "id, job_seeker_id, connection_id, gmail_message_id, thread_id, from_email, subject"
    )
    .eq("id", payload.email_id)
    .single();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Verify AM has access to this seeker
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", auth.user.id)
    .eq("job_seeker_id", email.job_seeker_id)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Verify the connection is still active
  const { data: connection } = await supabaseAdmin
    .from("seeker_email_connections")
    .select("id, is_active")
    .eq("id", email.connection_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json(
      { error: "Seeker's Gmail is not connected." },
      { status: 400 }
    );
  }

  try {
    const client = new GmailClient(connection.id);

    const replySubject = email.subject?.startsWith("Re:")
      ? email.subject
      : `Re: ${email.subject ?? ""}`;

    // Get the original message for threading
    const originalMsg = await client.getMessage(email.gmail_message_id);
    const messageIdHeader = originalMsg.payload.headers.find(
      (h: { name: string; value: string }) => h.name.toLowerCase() === "message-id"
    )?.value;

    const result = await client.sendEmail({
      to: email.from_email,
      subject: replySubject,
      body: payload.body.trim(),
      inReplyTo: messageIdHeader ?? undefined,
      references: messageIdHeader ?? undefined,
    });

    return NextResponse.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId,
    });
  } catch (err) {
    console.error("AM reply send error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to send reply",
      },
      { status: 500 }
    );
  }
}
