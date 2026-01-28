import { supabaseServer } from "@/lib/supabase/server";

type EnqueuePayload = {
  job_post_id?: string;
  job_seeker_id?: string;
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

  const { error } = await supabaseServer.from("application_queue").insert({
    job_post_id: payload.job_post_id,
    job_seeker_id: payload.job_seeker_id,
    status: "QUEUED",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return Response.json(
      { success: false, error: "Failed to enqueue application." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
