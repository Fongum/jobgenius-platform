import { encrypt, decrypt } from "./crypto";
import { supabaseServer } from "@/lib/supabase/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Full Gmail access scope — used with dedicated job search Gmail accounts
const GMAIL_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID env var is not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET env var is not set");
  return secret;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.WEB_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SITE_URL or WEB_BASE_URL must be set");
  return `${base}/api/portal/gmail/callback`;
}

/**
 * Build the Google OAuth consent URL.
 * `state` should be a signed/verifiable token containing the job_seeker_id.
 */
export function buildOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Refresh an access token using a stored refresh token.
 */
export async function refreshAccessToken(refreshTokenEnc: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const refreshToken = decrypt(refreshTokenEnc);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Get a valid access token for a seeker's Gmail connection.
 * Automatically refreshes if expired.
 */
export async function getValidAccessToken(connectionId: string): Promise<string> {
  const { data: conn, error } = await supabaseServer
    .from("seeker_email_connections")
    .select("access_token_enc, refresh_token_enc, token_expires_at")
    .eq("id", connectionId)
    .eq("is_active", true)
    .single();

  if (error || !conn) {
    throw new Error("Gmail connection not found or inactive");
  }

  const expiresAt = conn.token_expires_at
    ? new Date(conn.token_expires_at).getTime()
    : 0;
  const now = Date.now();

  // If token is still valid (with 5-min buffer), decrypt and return it
  if (expiresAt > now + 5 * 60 * 1000) {
    return decrypt(conn.access_token_enc);
  }

  // Token expired — refresh it
  const refreshed = await refreshAccessToken(conn.refresh_token_enc);
  const newExpiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000
  ).toISOString();

  await supabaseServer
    .from("seeker_email_connections")
    .update({
      access_token_enc: encrypt(refreshed.access_token),
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return refreshed.access_token;
}

/**
 * Get the email address associated with a Google OAuth token.
 */
export async function getGoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const data = await response.json();
  return data.email;
}
