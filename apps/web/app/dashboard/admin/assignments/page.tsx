import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import AssignmentsClient from "./AssignmentsClient";

export default async function AssignmentsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Get all account managers with assignment counts
  const { data: accountManagers } = await supabaseAdmin
    .from("account_managers")
    .select("id, name, email, role")
    .order("name", { ascending: true });

  // Get all assignments with seeker info
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select(`
      id, created_at,
      job_seekers (id, full_name, email, location, seniority, profile_completion),
      account_managers (id, name, email)
    `)
    .order("created_at", { ascending: false });

  // Get unassigned job seekers
  const { data: allSeekers } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, location, seniority, profile_completion")
    .order("full_name", { ascending: true });

  const assignedIds = new Set((assignments || []).map((a) => {
    const seeker = a.job_seekers as unknown as { id: string } | null;
    return seeker?.id;
  }).filter(Boolean));

  const unassignedSeekers = (allSeekers || []).filter((s) => !assignedIds.has(s.id));

  // Count per AM
  const countMap = new Map<string, number>();
  for (const a of assignments || []) {
    const am = a.account_managers as unknown as { id: string } | null;
    if (am) {
      countMap.set(am.id, (countMap.get(am.id) || 0) + 1);
    }
  }

  const amsWithCounts = (accountManagers || []).map((am) => ({
    ...am,
    assignmentCount: countMap.get(am.id) || 0,
  }));

  return (
    <AssignmentsClient
      accountManagers={amsWithCounts}
      assignments={(assignments || []) as unknown as Parameters<typeof AssignmentsClient>[0]["assignments"]}
      unassignedSeekers={unassignedSeekers}
    />
  );
}
