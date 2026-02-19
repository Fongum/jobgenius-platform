import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";

type EnqueuePayload = {
  job_post_id?: string;
  job_seeker_id?: string;
  category?: string;
};

export async function POST(request: Request) {
  let payload: EnqueuePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_post_id || !payload?.job_seeker_id) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_post_id, job_seeker_id.",
      },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    payload.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseServer.from("application_queue").insert({
    job_post_id: payload.job_post_id,
    job_seeker_id: payload.job_seeker_id,
    status: "QUEUED",
    category: payload.category ?? "manual",
    updated_at: new Date().toISOString(),
  }).select("id").single();

  if (error) {
    return Response.json(
      { success: false, error: "Failed to enqueue application." },
      { status: 500 }
    );
  }

  if (data?.id) {
    try {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: data.id,
        job_seeker_id: payload.job_seeker_id,
        job_post_id: payload.job_post_id,
      });
    } catch (err) {
      console.error("Failed to enqueue AUTO_START_RUN", err);
    }
  }

  return Response.json({ success: true });
}



