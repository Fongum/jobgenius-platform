// ============================================================
// The one HTML shell every notification email is rendered into.
//
// Constraints that shaped it, in order:
//   - Gmail blocks remote images by default, so the logo is drawn with a
//     table cell and a background colour rather than an <img>.
//   - Outlook ignores most CSS layout, so structure is tables and every
//     style is inline.
//   - The list view is what people actually read. A hidden preheader
//     supplies the snippet, otherwise Gmail repeats the subject back.
//   - Bodies interpolate employee names straight from the database, so
//     everything is escaped before it reaches the markup.
// ============================================================

import {
  BRAND,
  absoluteUrl,
  resolveStream,
  senderDisplayName,
  type EmailStream,
} from "@/lib/email/brand";

export type NotificationEmailInput = {
  category?: string | null;
  subject: string;
  /** Plain text. Blank lines separate paragraphs; "- " or "• " starts a bullet. */
  body?: string | null;
  /** Usually a relative dashboard path; made absolute here. */
  linkUrl?: string | null;
  /** Label on the button. Defaults to something derived from the stream. */
  ctaLabel?: string | null;
  /** Overrides the snippet Gmail shows. Falls back to the body's first line. */
  preheader?: string | null;
};

export type RenderedNotificationEmail = {
  subject: string;
  html: string;
  text: string;
  /** "JobGenius People Ops" — pass to sendAndLogEmail as fromName. */
  fromName: string;
  stream: EmailStream;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** First non-empty line, trimmed to a length Gmail will actually show. */
export function derivePreheader(body: string | null | undefined, fallback: string): string {
  const firstLine = (body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const source = firstLine ?? fallback;
  return source.length > 140 ? `${source.slice(0, 137).trimEnd()}...` : source;
}

const BULLET = /^[-•*]\s+/;

/** Plain-text body -> escaped paragraph and list markup. */
function renderBody(body: string): string {
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const allBullets = lines.length > 0 && lines.every((line) => BULLET.test(line));

      if (allBullets) {
        const items = lines
          .map(
            (line) =>
              `<li style="margin:0 0 6px;">${escapeHtml(line.replace(BULLET, ""))}</li>`
          )
          .join("");
        return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#374151;">${items}</ul>`;
      }

      const text = lines.map((line) => escapeHtml(line)).join("<br />");
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${text}</p>`;
    })
    .join("");
}

export function renderNotificationEmail(
  input: NotificationEmailInput
): RenderedNotificationEmail {
  const stream = resolveStream(input.category);
  const subject = input.subject.trim() || `${BRAND.name} update`;
  const body = (input.body ?? "").trim();
  const href = absoluteUrl(input.linkUrl);
  const ctaLabel = input.ctaLabel?.trim() || `Open ${stream.senderName}`;
  const preheader = input.preheader?.trim() || derivePreheader(body, subject);

  const cta = href
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
            <tr><td style="border-radius:8px;background:${stream.accent};">
              <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
            </td></tr>
          </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.canvas};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.hairline};border-radius:14px;overflow:hidden;">
      <tr><td style="height:4px;background:${stream.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:20px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" style="vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="width:30px;height:30px;border-radius:8px;background:${BRAND.markBackground};text-align:center;vertical-align:middle;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;letter-spacing:0.4px;">${escapeHtml(BRAND.mark)}</td>
                <td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.2px;">${escapeHtml(BRAND.name)}</td>
              </tr></table>
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${stream.accentSoft};font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:${stream.accent};">${escapeHtml(stream.chip)}</span>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 28px 4px;font-family:Helvetica,Arial,sans-serif;">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:700;color:${BRAND.ink};">${escapeHtml(subject)}</h1>
        ${renderBody(body)}
        ${cta}
      </td></tr>
      <tr><td style="padding:20px 28px 24px;">
        <div style="border-top:1px solid ${BRAND.hairline};padding-top:14px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
          <strong style="color:${BRAND.ink};font-weight:600;">${escapeHtml(BRAND.name)} ${escapeHtml(stream.senderName)}</strong><br />
          ${escapeHtml(stream.footerNote)}<br />
          <a href="${escapeHtml(absoluteUrl("/dashboard/notifications") ?? "#")}" style="color:${stream.accent};text-decoration:underline;">Manage notifications</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    `${BRAND.name} ${stream.senderName}`,
    "",
    subject,
    "",
    body,
    href ? `\n${ctaLabel}: ${href}` : "",
    "",
    stream.footerNote,
  ]
    .filter((part, index) => part !== "" || index > 0)
    .join("\n")
    .trim();

  return { subject, html, text, fromName: senderDisplayName(stream), stream };
}
