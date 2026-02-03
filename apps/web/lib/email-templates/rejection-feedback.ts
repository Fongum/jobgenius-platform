export function rejectionFeedbackEmail(params: {
  candidateName: string;
  jobTitle: string;
  company: string | null;
  feedback: string | null;
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const subject = `Update on your application — ${params.jobTitle} at ${company}`;

  const feedbackBlock = params.feedback
    ? `\nFeedback:\n${params.feedback}\n`
    : "";

  const text = [
    `Hi ${params.candidateName},`,
    "",
    `Thank you for your interest in the ${params.jobTitle} position at ${company}.`,
    "After careful consideration, the team has decided to move forward with other candidates at this time.",
    feedbackBlock,
    "We encourage you to apply for future positions that match your skills.",
    "",
    "Best,",
    "The Joblinca Team",
  ]
    .filter(Boolean)
    .join("\n");

  const feedbackHtml = params.feedback
    ? `<div style="background:#f9fafb;border-left:4px solid #d1d5db;padding:12px;margin:12px 0"><strong>Feedback:</strong><br/>${esc(params.feedback).replace(/\n/g, "<br/>")}</div>`
    : "";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Application Update</h2>
  <p>Hi ${esc(params.candidateName)},</p>
  <p>Thank you for your interest in the <strong>${esc(params.jobTitle)}</strong> position at <strong>${esc(company)}</strong>.</p>
  <p>After careful consideration, the team has decided to move forward with other candidates at this time.</p>
  ${feedbackHtml}
  <p>We encourage you to apply for future positions that match your skills.</p>
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
