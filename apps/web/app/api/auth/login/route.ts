import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

// Cookie options
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type LoginPayload = {
  email: string;
  password: string;
};

/**
 * POST /api/auth/login
 *
 * Authenticates a user with email and password.
 * Sets session cookies on success.
 */
export async function POST(request: Request) {
  let payload: LoginPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { email, password } = payload;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "unknown";

  const loginRateLimit = await enforceRateLimit({
    request,
    scope: "auth_login",
    identifier: normalizedEmail,
    limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX ?? 10),
    windowSeconds: Number(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC ?? 900),
    blockSeconds: Number(process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_SEC ?? 900),
  });

  if (!loginRateLimit.allowed) {
    return Response.json(
      { success: false, error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, loginRateLimit.retryAfterSeconds)) },
      }
    );
  }

  if (!email || !password) {
    return Response.json(
      { success: false, error: "Email and password are required." },
      { status: 400 }
    );
  }

  const result = await signIn(email, password);

  if (!result.success || !result.session) {
    return Response.json(
      { success: false, error: result.error ?? "Login failed." },
      { status: 401 }
    );
  }

  // Set cookies
  const cookieStore = cookies();

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

  cookieStore.set(USER_TYPE_COOKIE, result.user!.userType, {
    ...COOKIE_OPTIONS,
    httpOnly: false, // Allow client-side access for UI
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

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
