export function conversationMessageNotificationEmail(params: {
  seekerName: string;
  senderName: string;
  subjectLine: string;
  messagePreview: string;
  isTask: boolean;
  dueDate?: string | null;
  conversationUrl: string;
}): { subject: string; html: string; text: string } {
  const itemLabel = params.isTask ? "task" : "message";
  const subject = params.isTask
    ? `New task from ${params.senderName}: ${params.subjectLine}`
    : `New message from ${params.senderName}: ${params.subjectLine}`;

  const dueText = params.dueDate
    ? `Due date: ${new Date(params.dueDate).toLocaleDateString("en-US")}`
    : null;

  const text = [
    `Hi ${params.seekerName},`,
    "",
    `You have a new ${itemLabel} from ${params.senderName}.`,
    `Subject: ${params.subjectLine}`,
    dueText,
    "",
    params.messagePreview,
    "",
    `Open it here: ${params.conversationUrl}`,
    "",
    "Best,",
    "The JobGenius Team",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>${params.isTask ? "New Task Assigned" : "New Message"}</h2>
  <p>Hi ${esc(params.seekerName)},</p>
  <p>You have a new <strong>${itemLabel}</strong> from <strong>${esc(params.senderName)}</strong>.</p>
  <p><strong>Subject:</strong> ${esc(params.subjectLine)}</p>
  ${
    dueText
      ? `<p><strong>${esc(dueText)}</strong></p>`
      : ""
  }
  <p style="white-space:pre-wrap">${esc(params.messagePreview)}</p>
  <p>
    <a href="${esc(params.conversationUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">
      Open in JobGenius
    </a>
  </p>
  <p>Best,<br/>The JobGenius Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
