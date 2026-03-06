export function profileCompletionNudgeEmail({
  seekerName,
  completionPercent,
  portalUrl,
}: {
  seekerName: string;
  completionPercent: number;
  portalUrl: string;
}) {
  const remaining = 100 - completionPercent;
  const profileUrl = `${portalUrl}/portal/profile`;

  const missingItems = completionPercent < 40
    ? ["work history", "education", "skills", "contact information", "LinkedIn profile"]
    : completionPercent < 60
    ? ["work history", "education", "skills"]
    : completionPercent < 80
    ? ["LinkedIn profile", "portfolio link", "references"]
    : ["final profile details"];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Complete Your Profile</title>
  <style>
    body { margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 15px; }
    .body { padding: 32px; }
    .progress-bar-bg { background: #e5e7eb; border-radius: 999px; height: 12px; margin: 16px 0; }
    .progress-bar-fill { background: linear-gradient(90deg, #2563eb, #7c3aed); border-radius: 999px; height: 12px; }
    .progress-label { display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; margin-bottom: 4px; }
    .missing-list { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .missing-list p { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #1e40af; }
    .missing-list ul { margin: 0; padding-left: 20px; }
    .missing-list li { font-size: 14px; color: #1e3a8a; margin-bottom: 4px; }
    .cta { text-align: center; margin: 28px 0 8px; }
    .cta a { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 8px; }
    .footer { text-align: center; padding: 20px 32px; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Your profile is ${completionPercent}% complete</h1>
        <p>You're ${remaining}% away from a fully optimised profile</p>
      </div>
      <div class="body">
        <p style="color:#374151;font-size:15px;margin:0 0 16px">
          Hi ${seekerName},
        </p>
        <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px">
          Candidates with complete profiles are <strong style="color:#111827">3× more likely</strong> to be matched
          with great opportunities. Your account manager is ready to act — they just need a complete
          picture of your background.
        </p>

        <div class="progress-label">
          <span>Profile completion</span>
          <span>${completionPercent}%</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${completionPercent}%"></div>
        </div>

        <div class="missing-list">
          <p>Sections to complete:</p>
          <ul>
            ${missingItems.map((item) => `<li>${item.charAt(0).toUpperCase() + item.slice(1)}</li>`).join("\n            ")}
          </ul>
        </div>

        <div class="cta">
          <a href="${profileUrl}">Complete My Profile →</a>
        </div>

        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:16px 0 0">
          It takes less than 10 minutes. Your data is private and only shared with your assigned account manager.
        </p>
      </div>
      <div class="footer">
        JobGenius · <a href="${portalUrl}" style="color:#6b7280">Visit Portal</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${seekerName},

Your JobGenius profile is ${completionPercent}% complete. Candidates with complete profiles are 3× more likely to land great opportunities.

Sections to finish:
${missingItems.map((i) => `• ${i}`).join("\n")}

Complete your profile here: ${profileUrl}

— The JobGenius Team`;

  return {
    subject: `Your profile is ${completionPercent}% complete — finish it today`,
    html,
    text,
  };
}
