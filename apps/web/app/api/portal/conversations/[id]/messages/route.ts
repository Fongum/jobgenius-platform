import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
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

  // Get messages
  const { data: messages, error } = await supabaseAdmin
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: "Failed to fetch messages." }, { status: 500 });
  }

  // Mark AM messages as read
  await supabaseAdmin
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", params.id)
    .eq("sender_type", "account_manager")
    .is("read_at", null);

  return Response.json({ messages: messages ?? [] });
}

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
    .select("id, conversation_type, job_seeker_id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  let body: { content: string; is_answer?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return Response.json({ error: "Message content is required." }, { status: 400 });
  }

  // Insert message
  const { data: message, error } = await supabaseAdmin
    .from("conversation_messages")
    .insert({
      conversation_id: params.id,
      sender_type: "job_seeker",
      sender_id: auth.user.id,
      content: body.content.trim(),
      is_answer: body.is_answer ?? false,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to send message." }, { status: 500 });
  }

  // Update conversation updated_at
  await supabaseAdmin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.id);

  // If this is an answer to an application question, save to profile
  if (
    body.is_answer &&
    conversation.conversation_type === "application_question"
  ) {
    // Find the original question (first AM message in the conversation)
    const { data: firstQuestion } = await supabaseAdmin
      .from("conversation_messages")
      .select("content")
      .eq("conversation_id", params.id)
      .eq("sender_type", "account_manager")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (firstQuestion) {
      await supabaseAdmin.from("application_question_answers").insert({
        job_seeker_id: auth.user.id,
        question: firstQuestion.content,
        answer: body.content.trim(),
        conversation_id: params.id,
        message_id: message.id,
      });
    }
  }

  return Response.json({ message }, { status: 201 });
}
