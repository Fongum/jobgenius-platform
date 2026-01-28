import { supabaseServer } from "@/lib/supabase/server";

type ResumePayload = {
  queue_id?: string;
  note?: string;
};

export async function POST(request: Request) {
  let payload: ResumePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.queue_id) {
    return Response.json(
      { success: false, error: "Missing queue_id." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("application_queue")
    .update({
      status: "RUNNING",
      last_error: null,
      locked_by: null,
      locked_at: null,
      updated_at: nowIso,
    })
    .eq("id", payload.queue_id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to resume queue item." },
      { status: 500 }
    );
  }

  await supabaseServer.from("application_events").insert({
    queue_id: payload.queue_id,
    event_type: "RESUMED",
    message: payload.note ?? "Resumed by AM.",
  });

  await supabaseServer
    .from("attention_items")
    .update({
      status: "RESOLVED",
      resolved_at: nowIso,
    })
    .eq("queue_id", payload.queue_id);

  return Response.json({ success: true });
}
