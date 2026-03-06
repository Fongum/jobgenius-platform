export function amMessageNotificationEmail(params: {
  amName: string;
  seekerName: string;
  subjectLine: string;
  messagePreview: string;
  isTaskUpdate: boolean;
  taskTitle?: string | null;
  conversationUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = params.isTaskUpdate
    ? `Task update from ${params.seekerName}: ${params.subjectLine}`
    : `Reply from ${params.seekerName}: ${params.subjectLine}`;

  const headline = params.isTaskUpdate
    ? `Task Update — ${esc(params.taskTitle ?? params.subjectLine)}`
    : "New Reply";

  const text = [
    `Hi ${params.amName},`,
    "",
    params.isTaskUpdate
      ? `${params.seekerName} has updated the task "${params.taskTitle ?? params.subjectLine}".`
      : `${params.seekerName} sent a reply to "${params.subjectLine}".`,
    "",
    params.messagePreview,
    "",
    `Open conversation: ${params.conversationUrl}`,
    "",
    "Best,",
    "The JobGenius Platform",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>${headline}</h2>
  <p>Hi ${esc(params.amName)},</p>
  <p>
    ${
      params.isTaskUpdate
        ? `<strong>${esc(params.seekerName)}</strong> has updated the task <strong>${esc(params.taskTitle ?? params.subjectLine)}</strong>.`
        : `<strong>${esc(params.seekerName)}</strong> sent a reply to <strong>${esc(params.subjectLine)}</strong>.`
    }
  </p>
  <p style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${esc(params.messagePreview)}</p>
  <p>
    <a href="${esc(params.conversationUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">
      View Conversation
    </a>
  </p>
  <p>Best,<br/>The JobGenius Platform</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
