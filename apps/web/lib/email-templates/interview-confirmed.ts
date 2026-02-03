export function interviewConfirmedEmail(params: {
  recipientName: string;
  jobTitle: string;
  company: string | null;
  interviewType: string;
  scheduledAt: string;
  duration: number;
  meetingLink: string | null;
  phoneNumber: string | null;
  address: string | null;
  icsDataUri: string | null;
}): { subject: string; html: string; text: string } {
  const company = params.company ?? "the company";
  const typeLabel = params.interviewType.replace("_", "-");
  const dateStr = new Date(params.scheduledAt).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const subject = `Interview confirmed — ${params.jobTitle} at ${company}`;

  const details: string[] = [
    `Date & Time: ${dateStr}`,
    `Duration: ${params.duration} minutes`,
    `Type: ${typeLabel}`,
  ];
  if (params.meetingLink) details.push(`Meeting link: ${params.meetingLink}`);
  if (params.phoneNumber) details.push(`Phone: ${params.phoneNumber}`);
  if (params.address) details.push(`Location: ${params.address}`);

  const text = [
    `Hi ${params.recipientName},`,
    "",
    `Your ${typeLabel} interview for ${params.jobTitle} at ${company} is confirmed.`,
    "",
    ...details,
    "",
    "Best,",
    "The Joblinca Team",
  ].join("\n");

  const detailsHtml = details.map((d) => `<li>${esc(d)}</li>`).join("");

  const calendarBtn = params.icsDataUri
    ? `<p><a href="${esc(params.icsDataUri)}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px">Add to Calendar</a></p>`
    : "";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Interview Confirmed</h2>
  <p>Hi ${esc(params.recipientName)},</p>
  <p>Your <strong>${esc(typeLabel)}</strong> interview for <strong>${esc(params.jobTitle)}</strong> at <strong>${esc(company)}</strong> is confirmed.</p>
  <ul>${detailsHtml}</ul>
  ${calendarBtn}
  <p>Best,<br/>The Joblinca Team</p>
</div>`.trim();

  return { subject, html, text };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
