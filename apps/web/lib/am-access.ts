/**
 * Account Manager Access Control
 *
 * This module provides authentication and authorization for account managers.
 * It supports unified Bearer token and cookie-based auth.
 */

import { authenticateRequest, supabaseAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Cookie names for new auth
export type AccountManager = {
  id: string;
  name: string | null;
  email: string;
};

let cachedRunnerAccountManagerId: string | null | undefined;

async function getRunnerAccountManagerId() {
  if (cachedRunnerAccountManagerId !== undefined) {
    return cachedRunnerAccountManagerId;
  }

  const runnerEmail = process.env.RUNNER_AM_EMAIL;
  if (!runnerEmail) {
    cachedRunnerAccountManagerId = null;
    return cachedRunnerAccountManagerId;
  }

  const { data } = await supabaseAdmin
    .from("account_managers")
    .select("id")
    .eq("email", runnerEmail)
    .maybeSingle();

  cachedRunnerAccountManagerId = data?.id ?? null;
  return cachedRunnerAccountManagerId;
}

export async function isRunnerAccountManager(accountManagerId: string) {
  const runnerId = await getRunnerAccountManagerId();
  return Boolean(runnerId && runnerId === accountManagerId);
}

/**
 * Get account manager from request
 *
 * Checks authentication using unified auth middleware.
 */
export async function getAccountManagerFromRequest(headers?: Headers) {
  const request = new Request("http://internal", {
    headers: headers ?? new Headers(),
  });

  const auth = await authenticateRequest(request);
  if (!auth.authenticated) {
    return { error: auth.error } as const;
  }

  if (auth.user.userType !== "am") {
    return { error: "Account manager access required." } as const;
  }

  return {
    accountManager: {
      id: auth.user.id,
      name: auth.user.name ?? null,
      email: auth.user.email,
    },
  } as const;
}

/**
 * Check if account manager has access to a job seeker
 */
export async function hasJobSeekerAccess(
  accountManagerId: string,
  jobSeekerId: string
) {
  if (await isRunnerAccountManager(accountManagerId)) {
    return true;
  }

  const { data: am } = await supabaseAdmin
    .from("account_managers")
    .select("role")
    .eq("id", accountManagerId)
    .maybeSingle();

  if (isAdminRole(am?.role)) {
    return true;
  }

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
