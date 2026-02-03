/**
 * Authentication Middleware Utilities
 *
 * Provides functions for authenticating API routes.
 */

import { cookies } from "next/headers";
import { getCurrentUser, getUserByAuthId, supabaseAdmin } from "./server";
import type { AuthUser, UserType } from "./types";

// Cookie names
const ACCESS_TOKEN_COOKIE = "jg_access_token";
const USER_TYPE_COOKIE = "jg_user_type";

// Legacy header for backward compatibility during migration
const LEGACY_AM_EMAIL_HEADER = "x-am-email";

/**
 * Result of authentication check
 */
export type AuthCheckResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; error: string; status: number };

/**
 * Authenticate a request and return the user
 *
 * Checks in order:
 * 1. JWT token from Authorization header
 * 2. JWT token from cookie
 * 3. Legacy x-am-email header (for backward compatibility)
 */
export async function authenticateRequest(
  request: Request
): Promise<AuthCheckResult> {
  // 1. Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = await verifyToken(token);
    if (user) {
      return { authenticated: true, user };
    }
  }

  // 2. Check cookie
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) {
    const user = await verifyToken(accessToken);
    if (user) {
      return { authenticated: true, user };
    }
  }

  // 3. Legacy: Check x-am-email header (for backward compatibility)
  const legacyEmail = request.headers.get(LEGACY_AM_EMAIL_HEADER);
  if (legacyEmail) {
    const user = await getUserByLegacyEmail(legacyEmail);
    if (user) {
      return { authenticated: true, user };
    }
  }

  return {
    authenticated: false,
    error: "Authentication required.",
    status: 401,
  };
}

/**
 * Verify a JWT token and return the user
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    // Get user from our tables
    const cookieStore = cookies();
    const userType = cookieStore.get(USER_TYPE_COOKIE)?.value as UserType | undefined;
    return getUserByAuthId(user.id, userType);
  } catch {
    return null;
  }
}

/**
 * Get user by legacy email header (backward compatibility)
 */
async function getUserByLegacyEmail(email: string): Promise<AuthUser | null> {
  // Try account managers first
  const { data: am } = await supabaseAdmin
    .from("account_managers")
    .select("id, email, name, role")
    .eq("email", email)
    .single();

  if (am) {
    return {
      id: am.id,
      email: am.email,
      name: am.name ?? undefined,
      userType: "am",
      role: am.role,
    };
  }

  // Try job seekers
  const { data: js } = await supabaseAdmin
    .from("job_seekers")
    .select("id, email, full_name")
    .eq("email", email)
    .single();

  if (js) {
    return {
      id: js.id,
      email: js.email,
      name: js.full_name ?? undefined,
      userType: "job_seeker",
    };
  }

  return null;
}

/**
 * Require authentication for an API route
 *
 * Usage:
 * ```ts
 * export async function GET(request: Request) {
 *   const auth = await requireAuth(request);
 *   if (!auth.authenticated) {
 *     return Response.json({ error: auth.error }, { status: auth.status });
 *   }
 *   const { user } = auth;
 *   // ... rest of handler
 * }
 * ```
 */
export async function requireAuth(request: Request): Promise<AuthCheckResult> {
  return authenticateRequest(request);
}

/**
 * Require account manager authentication
 */
export async function requireAM(request: Request): Promise<AuthCheckResult> {
  const result = await authenticateRequest(request);

  if (!result.authenticated) {
    return result;
  }

  if (result.user.userType !== "am") {
    return {
      authenticated: false,
      error: "Account manager access required.",
      status: 403,
    };
  }

  return result;
}

/**
 * Require job seeker authentication
 */
export async function requireJobSeeker(request: Request): Promise<AuthCheckResult> {
  const result = await authenticateRequest(request);

  if (!result.authenticated) {
    return result;
  }

  if (result.user.userType !== "job_seeker") {
    return {
      authenticated: false,
      error: "Job seeker access required.",
      status: 403,
    };
  }

  return result;
}

/**
 * Check if user has access to a specific job seeker's data
 */
export async function requireJobSeekerAccess(
  request: Request,
  jobSeekerId: string
): Promise<AuthCheckResult> {
  const result = await authenticateRequest(request);

  if (!result.authenticated) {
    return result;
  }

  const { user } = result;

  // Job seekers can only access their own data
  if (user.userType === "job_seeker") {
    if (user.id !== jobSeekerId) {
      return {
        authenticated: false,
        error: "Access denied.",
        status: 403,
      };
    }
    return result;
  }

  // Account managers can access their assigned job seekers
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", user.id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!assignment) {
    return {
      authenticated: false,
      error: "Not authorized for this job seeker.",
      status: 403,
    };
  }

  return result;
}
