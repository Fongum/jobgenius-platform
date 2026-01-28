import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const prepId = context.params.id;
  if (!prepId) {
    return Response.json(
      { success: false, error: "Missing prep id." },
      { status: 400 }
    );
  }

  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, content, created_at, updated_at, job_posts (title, company), job_seekers (full_name, email)"
    )
    .eq("id", prepId)
    .single();

  if (prepError || !prep) {
    return Response.json(
      { success: false, error: "Interview prep not found." },
      { status: 404 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    prep.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  return Response.json({ success: true, prep });
}
