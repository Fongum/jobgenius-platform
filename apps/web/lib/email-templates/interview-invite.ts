export function interviewInviteEmail(params: {
  candidateName: string;
  jobTitle: string;
  company: string | null;
  interviewType: string;
  notesForCandidate: string | null;
  confirmUrl: string;
  slotSummaries: string[];
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const typeLabel = params.interviewType.replace("_", "-");
  const subject = `Interview invitation — ${params.jobTitle} at ${company}`;

  const slotLines = params.slotSummaries
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n");

  const text = [
    `Hi ${params.candidateName},`,
    "",
    `You've been invited to a ${typeLabel} interview for ${params.jobTitle} at ${company}.`,
    "",
    "Available time slots:",
    slotLines,
    "",
    `Please pick a time by visiting: ${params.confirmUrl}`,
    params.notesForCandidate
      ? `\nNote from the interviewer: ${params.notesForCandidate}`
      : "",
    "",
    "Best,",
    "The Joblinca Team",
  ]
    .filter(Boolean)
    .join("\n");

  const slotListHtml = params.slotSummaries
    .map((s) => `<li>${esc(s)}</li>`)
    .join("");

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Interview Invitation</h2>
  <p>Hi ${esc(params.candidateName)},</p>
  <p>You've been invited to a <strong>${esc(typeLabel)}</strong> interview for <strong>${esc(params.jobTitle)}</strong> at <strong>${esc(company)}</strong>.</p>
  <h3>Available Time Slots</h3>
  <ol>${slotListHtml}</ol>
  <p><a href="${esc(params.confirmUrl)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Choose a Time</a></p>
  ${params.notesForCandidate ? `<p><em>Note from the interviewer:</em> ${esc(params.notesForCandidate)}</p>` : ""}
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
