import { canTransitionOutreachState } from "@/lib/outreach-state";
import { supabaseServer } from "@/lib/supabase/server";

const ONE_BY_ONE_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4,
  1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

export async function GET(
  _request: Request,
  context: { params: { token: string } }
) {
  const token = context.params.token?.trim();
  if (!token) {
    return new Response(ONE_BY_ONE_GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  }

  const { data: message } = await supabaseServer
    .from("outreach_messages")
    .select("id, recruiter_thread_id, status, opened_at")
    .eq("open_tracking_token", token)
    .maybeSingle();

  if (message) {
    const nowIso = new Date().toISOString();
    let shouldTouchThread = false;
    if (!message.opened_at && canTransitionOutreachState(message.status, "OPENED")) {
      await supabaseServer
        .from("outreach_messages")
        .update({
          status: "OPENED",
          opened_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", message.id);
      shouldTouchThread = true;
    } else if (message.status === "OPENED" || message.status === "SENT" || message.status === "DELIVERED") {
      shouldTouchThread = true;
    }

    if (shouldTouchThread) {
      await supabaseServer
        .from("recruiter_threads")
        .update({
          thread_status: "WAITING_REPLY",
          updated_at: nowIso,
        })
        .eq("id", message.recruiter_thread_id)
        .neq("thread_status", "CLOSED");
    }
  }

  return new Response(ONE_BY_ONE_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
