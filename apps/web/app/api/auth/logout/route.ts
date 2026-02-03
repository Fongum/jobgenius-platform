import { cookies } from "next/headers";
import { signOut } from "@/lib/auth";

const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

/**
 * POST /api/auth/logout
 *
 * Logs out the current user and clears session cookies.
 */
export async function POST() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  // Sign out from Supabase if we have a token
  if (accessToken) {
    try {
      await signOut(accessToken);
    } catch {
      // Ignore errors - token might already be invalid
    }
  }

  // Clear cookies
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(USER_TYPE_COOKIE);

  return Response.json({ success: true });
}
