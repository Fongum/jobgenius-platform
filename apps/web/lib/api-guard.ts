import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_API_EXACT = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/reset-password",
  "/api/extension/auth",
  "/api/interview-confirm",
  "/api/portal/gmail/callback",
  "/api/outreach/webhook/resend",
  "/api/marketing/lead",
  "/api/voice/webhook/bland",
]);

const PUBLIC_API_PREFIXES = ["/api/outreach/track/open/"];

function isExplicitPublicApiPath(pathname: string) {
  if (PUBLIC_API_EXACT.has(pathname)) {
    return true;
  }

  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function hasApiAuthSignal(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const hasBearer = Boolean(
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
  );

  const hasOpsKey = Boolean(request.headers.get("x-ops-key"));
  const hasAccessToken = Boolean(request.cookies.get("jg_access_token")?.value);
  const hasRefreshToken = Boolean(request.cookies.get("jg_refresh_token")?.value);

  return hasBearer || hasOpsKey || hasAccessToken || hasRefreshToken;
}

export function guardApiRequest(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api")) {
    return null;
  }

  if (request.method.toUpperCase() === "OPTIONS") {
    return null;
  }

  if (isExplicitPublicApiPath(pathname)) {
    return null;
  }

  if (hasApiAuthSignal(request)) {
    return null;
  }

  return NextResponse.json(
    { success: false, error: "Authentication required." },
    { status: 401 }
  );
}
