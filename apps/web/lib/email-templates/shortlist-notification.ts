export function shortlistNotificationEmail(params: {
  candidateName: string;
  jobTitle: string;
  company: string | null;
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const subject = `You've been shortlisted — ${params.jobTitle} at ${company}`;

  const text = [
    `Hi ${params.candidateName},`,
    "",
    `Great news! You've been shortlisted for ${params.jobTitle} at ${company}.`,
    "The hiring team is reviewing your profile and you can expect to hear from them soon with next steps.",
    "",
    "Best,",
    "The Joblinca Team",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>You've Been Shortlisted!</h2>
  <p>Hi ${esc(params.candidateName)},</p>
  <p>Great news! You've been shortlisted for <strong>${esc(params.jobTitle)}</strong> at <strong>${esc(company)}</strong>.</p>
  <p>The hiring team is reviewing your profile and you can expect to hear from them soon with next steps.</p>
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
