import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

export type AccountManager = {
  id: string;
  name: string | null;
  email: string;
};

export async function getAccountManagerFromRequest(headers?: Headers) {
  const amEmail = getAmEmailFromHeaders(headers);

  if (!amEmail) {
    return { error: "Missing AM email." } as const;
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
