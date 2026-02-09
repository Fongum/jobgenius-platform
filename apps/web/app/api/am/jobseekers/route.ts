import { requireAM } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const accountManager = {
    id: auth.user.id,
    name: auth.user.name ?? null,
    email: auth.user.email,
  };

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select(
      "job_seeker_id, job_seekers (id, full_name, location, seniority, target_titles, work_type)"
    )
    .eq("account_manager_id", accountManager.id);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seekers." },
      { status: 500 }
    );
  }

  const seekers = (assignments ?? [])
    .map((assignment) => assignment.job_seekers)
    .filter(Boolean);

  return Response.json({
    success: true,
    account_manager: accountManager,
    job_seekers: seekers,
  });
}
