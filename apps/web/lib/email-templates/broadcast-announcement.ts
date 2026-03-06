export function broadcastAnnouncementEmail(params: {
  recipientName: string;
  subject: string;
  body: string;
  portalUrl: string;
}): { subject: string; html: string; text: string } {
  const text = [
    `Hi ${params.recipientName},`,
    "",
    params.body,
    "",
    `Visit your portal: ${params.portalUrl}`,
    "",
    "— The JobGenius Team",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:#2563eb;padding:20px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;color:#fff;font-size:20px">JobGenius</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111827">${esc(params.subject)}</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280">Hi ${esc(params.recipientName)},</p>
    <div style="margin:16px 0;white-space:pre-wrap;font-size:15px;line-height:1.6;color:#374151">${esc(params.body)}</div>
    <p style="margin:24px 0 0">
      <a href="${esc(params.portalUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
        Open JobGenius
      </a>
    </p>
  </div>
  <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;text-align:center">
    This message was sent by the JobGenius platform team.
  </p>
</div>`.trim();

  return { subject: params.subject, html, text };
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
