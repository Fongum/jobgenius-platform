import { conversationMessageNotificationEmail } from "@/lib/email-templates/conversation-message-notification";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import type { ConversationTaskAttachment } from "./tasks";

export async function notifySeekerConversationActivity(params: {
  seekerId: string;
  seekerEmail: string | null;
  seekerName: string | null;
  senderName: string;
  subjectLine: string;
  messagePreview: string;
  conversationId: string;
  task: ConversationTaskAttachment | null;
}) {
  if (!params.seekerEmail) {
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const normalizedBaseUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  const baseUrl = normalizedBaseUrl || "http://localhost:3000";
  const conversationUrl = `${baseUrl}/portal/conversations/${params.conversationId}`;

  const template = conversationMessageNotificationEmail({
    seekerName: params.seekerName ?? "there",
    senderName: params.senderName,
    subjectLine: params.subjectLine,
    messagePreview: params.messagePreview,
    isTask: Boolean(params.task),
    dueDate: params.task?.due_date ?? null,
    conversationUrl,
  });

  await sendAndLogEmail({
    to: params.seekerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    template_key: "conversation_message_notification",
    job_seeker_id: params.seekerId,
    meta: {
      conversation_id: params.conversationId,
      is_task: Boolean(params.task),
      due_date: params.task?.due_date ?? null,
    },
  }).catch(() => {});
}
