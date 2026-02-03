export function offerNotificationEmail(params: {
  candidateName: string;
  jobTitle: string;
  company: string | null;
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const subject = `Congratulations! Offer for ${params.jobTitle} at ${company}`;

  const text = [
    `Hi ${params.candidateName},`,
    "",
    `Congratulations! We're pleased to let you know that ${company} would like to extend an offer for the ${params.jobTitle} position.`,
    "",
    "A member of the team will be in touch shortly with the full details.",
    "",
    "Best,",
    "The Joblinca Team",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Congratulations!</h2>
  <p>Hi ${esc(params.candidateName)},</p>
  <p>We're pleased to let you know that <strong>${esc(company)}</strong> would like to extend an offer for the <strong>${esc(params.jobTitle)}</strong> position.</p>
  <p>A member of the team will be in touch shortly with the full details.</p>
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
