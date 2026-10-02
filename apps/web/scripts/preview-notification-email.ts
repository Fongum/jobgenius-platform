// ============================================================
// Renders one sample of each notification stream to a single HTML page,
// so the branding can be looked at without sending anything.
//
//   npx vite-node -c vitest.config.ts scripts/preview-notification-email.ts
//
// The -c is not optional: it is what teaches vite-node the "@/" alias.
// Writes notification-email-preview.html into the current directory.
// ============================================================

import { writeFileSync } from "fs";
import { renderNotificationEmail } from "../lib/email/notification-email";

process.env.NEXT_PUBLIC_APP_URL ??= "https://app.job-genius.com";

const SAMPLES = [
  {
    category: "people_ops_review_digest",
    subject: "People Ops review digest — 24 Aug 2026",
    body: [
      "2 scorecards due, 1 onboarding follow-up",
      "",
      "- Scorecards due (2): LAIKA LESLIE AFANYU, ETAH ASHU ELIZABETH TACHE",
      "- Onboarding follow-up (1): Castro Koji",
      "",
      "Review period: August 2026.",
      "Open the People Ops dashboard to review and action these items.",
    ].join("\n"),
    linkUrl: "/dashboard/people",
  },
  {
    category: "attendance_long_shift",
    subject: "Fidelis Fongum has been signed in for 10h 15m",
    body: [
      "Fidelis Fongum signed in at 13:54 on Friday, 14 August 2026 and has not signed out — 10h 15m ago.",
      "",
      "Most likely they lost power or closed the laptop without signing out. Nothing has been closed automatically, because guessing an end time would put a wrong number into their hours.",
    ].join("\n"),
    linkUrl: "/dashboard/attendance?date=2026-08-14",
  },
  {
    category: "payslip_awaiting_sign",
    subject: "Your August payslip is ready to sign",
    body: "Your payslip for August 2026 has been issued and is waiting for your signature.",
    linkUrl: "/portal/payslips",
  },
  {
    category: "delivery_blocker_due",
    subject: "Blocker due today on Castro Koji's placement",
    body: "The blocker you logged on 17 August is due today and has not been cleared.",
    linkUrl: "/dashboard/delivery",
  },
] as const;

const cards = SAMPLES.map((sample) => {
  const email = renderNotificationEmail(sample);
  return `<section>
    <h2>${email.stream.chip}</h2>
    <p class="meta"><strong>From:</strong> ${email.fromName} &lt;noreply@job-genius.com&gt;</p>
    <p class="meta"><strong>Subject:</strong> ${email.subject}</p>
    <p class="meta"><strong>Preview text:</strong> ${sample.body.split("\n")[0]}</p>
    <iframe srcdoc="${email.html.replace(/"/g, "&quot;")}" title="${email.stream.chip}"></iframe>
  </section>`;
}).join("\n");

const page = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>Notification email preview</title>
<style>
  body { font-family: system-ui, sans-serif; background: #fafafa; margin: 0; padding: 32px; color: #111827; }
  h1 { font-size: 22px; margin: 0 0 24px; }
  section { max-width: 640px; margin: 0 0 40px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin: 0 0 8px; }
  .meta { margin: 2px 0; font-size: 13px; color: #374151; }
  iframe { width: 100%; height: 620px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; margin-top: 12px; }
</style></head><body>
<h1>JobGenius notification email — one sample per stream</h1>
${cards}
</body></html>`;

writeFileSync("notification-email-preview.html", page);
console.log("wrote notification-email-preview.html");
