/**
 * Wraps an AI-generated email body in a professional HTML template.
 */
export function networkOutreachEmail(params: {
  subject: string;
  body: string;
}): { subject: string; html: string; text: string } {
  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;line-height:1.6">
  ${params.body}
</div>`.trim();

  // Strip HTML tags for plain-text version
  const text = params.body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject: params.subject, html, text };
}
