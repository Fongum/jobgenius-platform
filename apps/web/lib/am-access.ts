/**
 * Account Manager Access Control
 *
 * This module provides authentication and authorization for account managers.
 * It supports both the new JWT-based auth and legacy x-am-email header auth
 * for backward compatibility during migration.
 */

import { cookies } from "next/headers";
import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

// Cookie names for new auth
const ACCESS_TOKEN_COOKIE = "jg_access_token";
const USER_TYPE_COOKIE = "jg_user_type";

// Supabase admin client for token verification
let supabaseAdmin: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;

async function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const { createClient } = await import("@supabase/supabase-js");
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return supabaseAdmin;
}

export type AccountManager = {
  id: string;
  name: string | null;
  email: string;
};

/**
 * Get account manager from request
 *
 * Checks authentication in order:
 * 1. Authorization header (Bearer token)
 * 2. Session cookie
 * 3. Legacy x-am-email header
 */
export async function getAccountManagerFromRequest(headers?: Headers) {
  // 1. Try Authorization header
  const authHeader = headers?.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await getAccountManagerFromToken(token);
    if (result) return { accountManager: result };
  }

  // 2. Try session cookie
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const userType = cookieStore.get(USER_TYPE_COOKIE)?.value;

    if (accessToken && userType === "am") {
      const result = await getAccountManagerFromToken(accessToken);
      if (result) return { accountManager: result };
    }
  } catch {
    // cookies() might throw in some contexts
  }

  // 3. Fallback to legacy x-am-email header
  const amEmail = getAmEmailFromHeaders(headers);

  if (!amEmail) {
    return { error: "Authentication required." } as const;
  }

  const { data: accountManager, error } = await supabaseServer
    .from("account_managers")
    .select("id, name, email")
    .eq("email", amEmail)
    .single();

  if (error || !accountManager) {
    return { error: "Account manager not found." } as const;
  }

  return { accountManager } as const;
}

/**
 * Get account manager from JWT token
 */
async function getAccountManagerFromToken(token: string): Promise<AccountManager | null> {
  try {
    const admin = await getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);

    if (error || !user) return null;

    // Look up AM by auth_id
    const { data: am } = await supabaseServer
      .from("account_managers")
      .select("id, name, email")
      .eq("auth_id", user.id)
      .single();

    if (am) return am;

    // Fallback: look up by email
    const { data: amByEmail } = await supabaseServer
      .from("account_managers")
      .select("id, name, email")
      .eq("email", user.email)
      .single();

    return amByEmail ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if account manager has access to a job seeker
 */
export async function hasJobSeekerAccess(
  accountManagerId: string,
  jobSeekerId: string
) {
  const { data, error } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", accountManagerId)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}

/**
 * Get all job seekers assigned to an account manager
 */
export async function getAssignedJobSeekers(accountManagerId: string) {
  const { data, error } = await supabaseServer
    .from("job_seeker_assignments")
    .select(`
      job_seeker_id,
      job_seekers (
        id,
        full_name,
        email,
        location,
        seniority,
        status,
        created_at
      )
    `)
    .eq("account_manager_id", accountManagerId);

  if (error || !data) return [];

  return data
    .map((row) => row.job_seekers)
    .filter((js): js is NonNullable<typeof js> => js !== null);
}
