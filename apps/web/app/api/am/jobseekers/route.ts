import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const amEmail = getAmEmailFromHeaders(request.headers);

  if (!amEmail) {
    return Response.json(
      { success: false, error: "Missing AM email." },
      { status: 400 }
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id, name, email")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return Response.json(
      { success: false, error: "Account manager not found." },
      { status: 404 }
    );
  }

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
