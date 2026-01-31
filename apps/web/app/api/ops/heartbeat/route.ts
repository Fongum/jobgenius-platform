import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";

type HeartbeatPayload = {
  runner_id?: string;
  meta?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const auth = requireOpsAuth(request.headers);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  let payload: HeartbeatPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.runner_id) {
    return Response.json(
      { success: false, error: "Missing runner_id." },
      { status: 400 }
    );
  }

  await supabaseServer.from("runner_heartbeats").insert({
    runner_id: payload.runner_id,
    ts: new Date().toISOString(),
    meta: payload.meta ?? {},
  });

  return Response.json({ success: true });
}
