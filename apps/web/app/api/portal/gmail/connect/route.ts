import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth/middleware";
import { buildOAuthUrl } from "@/lib/gmail/oauth";
import crypto from "crypto";

/**
 * GET /api/portal/gmail/connect
 * Returns the Google OAuth consent URL for the authenticated job seeker.
 * The state param contains a signed token with the seeker's ID.
 */
export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;

  // Build a state token: seekerId + timestamp + hmac for verification
  const timestamp = Date.now().toString();
  const payload = `${seekerId}:${timestamp}`;
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Gmail integration not configured" },
      { status: 500 }
    );
  }

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const state = Buffer.from(`${payload}:${hmac}`).toString("base64url");

  const url = buildOAuthUrl(state);
  return NextResponse.json({ url });
}
