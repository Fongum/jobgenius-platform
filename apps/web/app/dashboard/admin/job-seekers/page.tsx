import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import JobSeekersClient from "./JobSeekersClient";

export default async function AdminJobSeekersPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Get all job seekers
  const { data: jobSeekers } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .order("created_at", { ascending: false });

  // Get all assignments
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select(`
      job_seeker_id,
      account_managers (id, name, email)
    `);

  // Get all account managers for dropdown
  const { data: accountManagers } = await supabaseAdmin
    .from("account_managers")
    .select("id, name, email")
    .order("name", { ascending: true });

  // Build assignment map
  const assignmentMap = new Map<string, { id: string; name: string | null; email: string }>();
  for (const a of assignments || []) {
    const am = a.account_managers as unknown as { id: string; name: string | null; email: string } | null;
    if (am) {
      assignmentMap.set(a.job_seeker_id, am);
    }
  }

  const seekersWithAssignment = (jobSeekers || []).map((s) => ({
    ...s,
    assignedAM: assignmentMap.get(s.id) || null,
  }));

  return (
    <JobSeekersClient
      jobSeekers={seekersWithAssignment}
      accountManagers={accountManagers || []}
    />
  );
}
