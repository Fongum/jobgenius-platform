import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import AccountsClient from "./AccountsClient";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";

  // Get all account managers
  const { data: accountManagers } = await supabaseAdmin
    .from("account_managers")
    .select("*")
    .order("created_at", { ascending: false });

  // Get assignment counts per AM
  const { data: assignmentCounts } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id");

  const countMap = new Map<string, number>();
  for (const a of assignmentCounts || []) {
    countMap.set(a.account_manager_id, (countMap.get(a.account_manager_id) || 0) + 1);
  }

  const amsWithCounts = (accountManagers || []).map((am) => ({
    ...am,
    assignmentCount: countMap.get(am.id) || 0,
  }));

  return (
    <AccountsClient
      accountManagers={amsWithCounts}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}
