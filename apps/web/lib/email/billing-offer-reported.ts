export function billingOfferReportedHtml({
  recipientName,
  seekerName,
  company,
  role,
  baseSalary,
  offerAcceptedAt,
  actionUrl,
  needsConfirmation,
}: {
  recipientName: string;
  seekerName: string;
  company: string;
  role: string;
  baseSalary: number;
  offerAcceptedAt: string;
  actionUrl: string;
  needsConfirmation: boolean;
}): string {
  const commission = baseSalary * 0.05;
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e40af;">Job Offer Reported 🎉</h2>
      <p>Hello ${recipientName},</p>
      <p>A job offer has been reported for <strong>${seekerName}</strong>:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Company</td><td style="padding:8px;border:1px solid #e5e7eb;">${company}</td></tr>
        <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Role</td><td style="padding:8px;border:1px solid #e5e7eb;">${role}</td></tr>
        <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Base Salary</td><td style="padding:8px;border:1px solid #e5e7eb;">$${baseSalary.toLocaleString()}</td></tr>
        <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Accepted On</td><td style="padding:8px;border:1px solid #e5e7eb;">${new Date(offerAcceptedAt).toLocaleDateString()}</td></tr>
        <tr><td style="padding:8px;background:#fff9e6;border:1px solid #e5e7eb;font-weight:600;">Commission (5%)</td><td style="padding:8px;border:1px solid #e5e7eb;color:#d97706;font-weight:600;">$${commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
      </table>
      ${
        needsConfirmation
          ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px;margin:16px 0;">
               <p style="margin:0;color:#92400e;"><strong>Action Required:</strong> Please confirm this offer is accurate. The 60-day commission window does not start until both parties confirm.</p>
             </div>
             <a href="${actionUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
               Confirm Offer
             </a>`
          : `<p>The other party will be asked to confirm. Once both confirm, the 60-day commission window begins.</p>
             <a href="${actionUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
               View Details
             </a>`
      }
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">JobGenius Billing System</p>
    </div>
  `;
}
