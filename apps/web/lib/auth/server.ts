/**
 * Server-side Authentication Utilities
 *
 * Handles authentication using Supabase Auth.
 */

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type {
  AuthUser,
  UserType,
  AuthResult,
  Session,
  AccountManager,
  JobSeeker,
} from "./types";

// Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service client for admin operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Cookie names
const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

/**
 * Create a Supabase client with the user's session
 */
export function createAuthClient() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get the current user from the session cookie
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const userType = cookieStore.get(USER_TYPE_COOKIE)?.value as UserType | undefined;

  if (!accessToken) {
    return null;
  }

  try {
    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    // Look up the user in our tables
    const authUser = await getUserByAuthId(user.id, userType);
    return authUser;
  } catch {
    return null;
  }
}

/**
 * Get user by Supabase auth ID
 */
export async function getUserByAuthId(
  authId: string,
  preferredType?: UserType
): Promise<AuthUser | null> {
  // Try preferred type first if specified
  if (preferredType === "am") {
    const am = await getAccountManagerByAuthId(authId);
    if (am) {
      return {
        id: am.id,
        email: am.email,
        name: am.name ?? undefined,
        userType: "am",
        role: am.role,
      };
    }
  }

  if (preferredType === "job_seeker") {
    const js = await getJobSeekerByAuthId(authId);
    if (js) {
      return {
        id: js.id,
        email: js.email,
        name: js.full_name ?? undefined,
        userType: "job_seeker",
      };
    }
  }

  // Try both if no preferred type or preferred type not found
  const am = await getAccountManagerByAuthId(authId);
  if (am) {
    return {
      id: am.id,
      email: am.email,
      name: am.name ?? undefined,
      userType: "am",
      role: am.role,
    };
  }

  const js = await getJobSeekerByAuthId(authId);
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
 * Get account manager by auth ID
 */
async function getAccountManagerByAuthId(
  authId: string
): Promise<AccountManager | null> {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("*")
    .eq("auth_id", authId)
    .single();

  if (error || !data) return null;
  return data as AccountManager;
}

/**
 * Get job seeker by auth ID
 */
async function getJobSeekerByAuthId(
  authId: string
): Promise<JobSeeker | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("auth_id", authId)
    .single();

  if (error || !data) return null;
  return data as JobSeeker;
}

/**
 * Get account manager by email
 */
export async function getAccountManagerByEmail(
  email: string
): Promise<AccountManager | null> {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  return data as AccountManager;
}

/**
 * Get job seeker by email
 */
export async function getJobSeekerByEmail(
  email: string
): Promise<JobSeeker | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  return data as JobSeeker;
}

/**
 * Sign up a new user
 */
export async function signUp(
  email: string,
  password: string,
  userType: UserType,
  metadata?: { name?: string }
): Promise<AuthResult> {
  // Check if email already exists in the appropriate table
  if (userType === "am") {
    const existing = await getAccountManagerByEmail(email);
    if (existing?.auth_id) {
      return { success: false, error: "An account with this email already exists." };
    }
  } else {
    const existing = await getJobSeekerByEmail(email);
    if (existing?.auth_id) {
      return { success: false, error: "An account with this email already exists." };
    }
  }

  // Create Supabase auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm for now
    user_metadata: {
      user_type: userType,
      name: metadata?.name,
    },
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? "Failed to create account." };
  }

  // Link auth user to our table
  if (userType === "am") {
    // Check if AM record exists (might be pre-created)
    const existing = await getAccountManagerByEmail(email);
    if (existing) {
      // Update existing record with auth_id
      await supabaseAdmin
        .from("account_managers")
        .update({ auth_id: authData.user.id, name: metadata?.name ?? existing.name })
        .eq("id", existing.id);
    } else {
      // Create new AM record
      await supabaseAdmin.from("account_managers").insert({
        email,
        name: metadata?.name,
        auth_id: authData.user.id,
        role: "am",
      });
    }
  } else {
    // Check if job seeker record exists (might be pre-created by AM)
    const existing = await getJobSeekerByEmail(email);
    if (existing) {
      // Update existing record with auth_id
      await supabaseAdmin
        .from("job_seekers")
        .update({ auth_id: authData.user.id, full_name: metadata?.name ?? existing.full_name })
        .eq("id", existing.id);
    } else {
      // Create new job seeker record
      await supabaseAdmin.from("job_seekers").insert({
        email,
        full_name: metadata?.name,
        auth_id: authData.user.id,
        status: "active",
      });
    }
  }

  // Get the linked user
  const user = await getUserByAuthId(authData.user.id, userType);
  if (!user) {
    return { success: false, error: "Failed to link account." };
  }

  return {
    success: true,
    user,
  };
}

/**
 * Sign in a user
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  // Sign in with Supabase
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    return { success: false, error: error?.message ?? "Invalid credentials." };
  }

  // Get user from our tables
  const user = await getUserByAuthId(data.user.id);
  if (!user) {
    return { success: false, error: "User account not found." };
  }

  // Update last login
  if (user.userType === "am") {
    await supabaseAdmin
      .from("account_managers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  } else {
    await supabaseAdmin
      .from("job_seekers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const session: Session = {
    user,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Date.now() / 1000 + 3600,
  };

  return { success: true, user, session };
}

/**
 * Sign out a user
 */
export async function signOut(accessToken: string): Promise<void> {
  await supabaseAdmin.auth.admin.signOut(accessToken);
}

/**
 * Refresh a session
 */
export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.user || !data.session) {
    return { success: false, error: "Session expired. Please log in again." };
  }

  const user = await getUserByAuthId(data.user.id);
  if (!user) {
    return { success: false, error: "User not found." };
  }

  const session: Session = {
    user,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Date.now() / 1000 + 3600,
  };

  return { success: true, user, session };
}

/**
 * Initiate password reset
 */
export async function initiatePasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Update password with reset token
 */
export async function updatePassword(
  accessToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Create a client with the access token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Check if a user has access to a job seeker
 */
export async function hasJobSeekerAccess(
  userId: string,
  userType: UserType,
  jobSeekerId: string
): Promise<boolean> {
  // Job seekers can only access themselves
  if (userType === "job_seeker") {
    return userId === jobSeekerId;
  }

  // Account managers can access their assigned job seekers
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", userId)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  return !error && data !== null;
}

/**
 * Get all job seekers assigned to an account manager
 */
export async function getAssignedJobSeekers(accountManagerId: string): Promise<JobSeeker[]> {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seekers(*)")
    .eq("account_manager_id", accountManagerId);

  if (error || !data) return [];

  return data
    .map((row) => row.job_seekers as unknown as JobSeeker | null)
    .filter((js): js is JobSeeker => js !== null);
}
