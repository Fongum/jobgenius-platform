import { cookies } from "next/headers";
import { refreshSession } from "@/lib/auth";

const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * POST /api/auth/refresh
 *
 * Refreshes the access token using the refresh token.
 */
export async function POST() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return Response.json(
      { success: false, error: "No refresh token." },
      { status: 401 }
    );
  }

  const result = await refreshSession(refreshToken);

  if (!result.success || !result.session) {
    // Clear invalid cookies
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    cookieStore.delete(USER_TYPE_COOKIE);

    return Response.json(
      { success: false, error: result.error ?? "Session expired." },
      { status: 401 }
    );
  }

  // Update cookies
  cookieStore.set(ACCESS_TOKEN_COOKIE, result.session.accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour
  });

  if (result.session.refreshToken) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, result.session.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return Response.json({
    success: true,
    user: {
      id: result.user!.id,
      email: result.user!.email,
      name: result.user!.name,
      userType: result.user!.userType,
      role: result.user!.role,
    },
  });
}
