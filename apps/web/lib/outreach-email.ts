function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ensureTrackingToken(token?: string | null) {
  if (token && token.trim()) {
    return token.trim();
  }
  return crypto.randomUUID();
}

export function buildTrackingOpenUrl({
  token,
  requestUrl,
}: {
  token: string;
  requestUrl: string;
}) {
  const configuredBase = process.env.OUTREACH_TRACK_BASE_URL?.trim();
  const encoded = encodeURIComponent(token);
  if (configuredBase) {
    return `${configuredBase.replace(/\/+$/, "")}/api/outreach/track/open/${encoded}`;
  }

  try {
    const parsed = new URL(requestUrl);
    return `${parsed.origin}/api/outreach/track/open/${encoded}`;
  } catch {
    return `/api/outreach/track/open/${encoded}`;
  }
}

export function buildHtmlBodyWithTracking(body: string, trackingUrl: string) {
  const safe = escapeHtml(body).replace(/\n/g, "<br/>");
  return [
    `<div style="font-family: Arial, sans-serif; line-height: 1.5;">${safe}</div>`,
    `<img src="${trackingUrl}" alt="" width="1" height="1" style="display:block;border:0;" />`,
  ].join("");
}
