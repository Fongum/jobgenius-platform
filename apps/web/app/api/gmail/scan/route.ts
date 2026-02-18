import { requireOpsAuth } from "@/lib/ops-auth";
import { scanAllInboxes } from "@/lib/gmail/inbox-scanner";

/**
 * GET /api/gmail/scan
 * Triggered by cron to scan all active Gmail connections for new job-related emails.
 */
export async function GET(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  try {
    const result = await scanAllInboxes();
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error("Gmail scan error:", err);
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Scan failed",
      },
      { status: 500 }
    );
  }
}
