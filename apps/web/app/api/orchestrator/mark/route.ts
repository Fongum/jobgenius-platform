import { supabaseServer } from "@/lib/supabase/server";

type MarkPayload = {
  queue_id?: string;
  status?: "FAILED" | "CANCELLED";
  note?: string;
};

export async function POST(request: Request) {
  let payload: MarkPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.queue_id || !payload.status) {
    return Response.json(
      { success: false, error: "Missing queue_id or status." },
      { status: 400 }
    );
  }

  if (!["FAILED", "CANCELLED"].includes(payload.status)) {
    return Response.json(
      { success: false, error: "Invalid status value." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("application_queue")
    .update({
      status: payload.status,
      last_error: payload.note ?? null,
      updated_at: nowIso,
    })
    .eq("id", payload.queue_id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to update queue item." },
      { status: 500 }
    );
  }

  await supabaseServer.from("application_events").insert({
    queue_id: payload.queue_id,
    event_type: payload.status === "FAILED" ? "FAILED" : "ERROR",
    message: payload.note ?? `Marked ${payload.status}.`,
  });

  await supabaseServer
    .from("attention_items")
    .update({
      status: payload.status === "CANCELLED" ? "DISMISSED" : "RESOLVED",
      resolved_at: nowIso,
    })
    .eq("queue_id", payload.queue_id);

  return Response.json({ success: true });
}
