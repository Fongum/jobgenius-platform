import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";

async function runRetention(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const { data: heartbeatsCount, error: heartbeatError } =
    await supabaseServer.rpc("cleanup_runner_heartbeats", { days: 14 });

  if (heartbeatError) {
    return Response.json(
      { success: false, error: "Failed to cleanup runner heartbeats." },
      { status: 500 }
    );
  }

  const { data: eventsCount, error: eventsError } =
    await supabaseServer.rpc("cleanup_apply_run_events", { days: 30 });

  if (eventsError) {
    return Response.json(
      { success: false, error: "Failed to cleanup apply run events." },
      { status: 500 }
    );
  }

  const { data: alertsCount, error: alertsError } =
    await supabaseServer.rpc("cleanup_ops_alerts", { days: 30 });

  if (alertsError) {
    return Response.json(
      { success: false, error: "Failed to cleanup ops alerts." },
      { status: 500 }
    );
  }

  const cutoffIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: voiceSessions, error: voiceError } = await supabaseServer
    .from("voice_interview_sessions")
    .delete()
    .lt("created_at", cutoffIso)
    .select("id");

  if (voiceError) {
    return Response.json(
      { success: false, error: "Failed to cleanup voice interview transcripts." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    deleted: {
      runner_heartbeats: heartbeatsCount ?? 0,
      apply_run_events: eventsCount ?? 0,
      ops_alerts: alertsCount ?? 0,
      voice_sessions: voiceSessions?.length ?? 0,
    },
  });
}

export async function POST(request: Request) {
  return runRetention(request);
}

export async function GET(request: Request) {
  return runRetention(request);
}
