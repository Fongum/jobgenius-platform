export function interviewPrepReadyEmail(params: {
  recipientName: string;
  jobTitle: string;
  company: string | null;
  prepUrl: string;
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const subject = `Interview prep ready - ${params.jobTitle} at ${company}`;

  const text = [
    `Hi ${params.recipientName},`,
    "",
    `Your interview prep for ${params.jobTitle} at ${company} is ready.`,
    `Review it here: ${params.prepUrl}`,
    "",
    "Inside you'll find role-specific questions, STAR guidance, and a readiness checklist.",
    "",
    "Best,",
    "The Joblinca Team",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Interview Prep Ready</h2>
  <p>Hi ${esc(params.recipientName)},</p>
  <p>Your interview prep for <strong>${esc(params.jobTitle)}</strong> at <strong>${esc(company)}</strong> is ready.</p>
  <p>
    <a href="${esc(params.prepUrl)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Open Interview Prep</a>
  </p>
  <p>Inside you'll find role-specific questions, STAR guidance, and a readiness checklist.</p>
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}