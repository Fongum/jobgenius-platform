export function applicationAckEmail(params: {
  candidateName: string;
  jobTitle: string;
  company: string | null;
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const subject = `Application received — ${params.jobTitle} at ${company}`;

  const text = [
    `Hi ${params.candidateName},`,
    "",
    `Your application for ${params.jobTitle} at ${company} has been received.`,
    "We'll keep you posted as your application progresses.",
    "",
    "Best,",
    "The Joblinca Team",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Application Received</h2>
  <p>Hi ${esc(params.candidateName)},</p>
  <p>Your application for <strong>${esc(params.jobTitle)}</strong> at <strong>${esc(company)}</strong> has been received.</p>
  <p>We'll keep you posted as your application progresses.</p>
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
