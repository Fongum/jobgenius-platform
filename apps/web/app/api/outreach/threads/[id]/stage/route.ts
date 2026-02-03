import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

type StagePayload = {
  recruiter_status?: "NEW" | "CONTACTED" | "ENGAGED" | "INTERVIEWING" | "CLOSED";
  thread_status?: "ACTIVE" | "WAITING_REPLY" | "FOLLOW_UP_DUE" | "CLOSED";
  mark_interview?: boolean;
  mark_offer?: boolean;
  close_reason?: string | null;
};

const RECRUITER_STATUS_OPTIONS = new Set([
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "INTERVIEWING",
  "CLOSED",
]);

const THREAD_STATUS_OPTIONS = new Set([
  "ACTIVE",
  "WAITING_REPLY",
  "FOLLOW_UP_DUE",
  "CLOSED",
]);

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const threadId = context.params.id;
  if (!threadId) {
    return Response.json(
      { success: false, error: "Missing thread id." },
      { status: 400 }
    );
  }

  let payload: StagePayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (
    payload.recruiter_status &&
    !RECRUITER_STATUS_OPTIONS.has(payload.recruiter_status)
  ) {
    return Response.json(
      { success: false, error: "Invalid recruiter_status." },
      { status: 400 }
    );
  }

  if (
    payload.thread_status &&
    !THREAD_STATUS_OPTIONS.has(payload.thread_status)
  ) {
    return Response.json(
      { success: false, error: "Invalid thread_status." },
      { status: 400 }
    );
  }

  const auth = requireOpsAuth(request.headers, request.url);
  let amResult: Awaited<ReturnType<typeof getAccountManagerFromRequest>> | null = null;
  if (!auth.ok) {
    amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
  }

  const { data: thread } = await supabaseServer
    .from("recruiter_threads")
    .select(
      "id, recruiter_id, job_seeker_id, interview_started_at, offer_received_at, closed_at"
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    return Response.json(
      { success: false, error: "Thread not found." },
      { status: 404 }
    );
  }

  if (amResult && !("error" in amResult)) {
    const hasAccess = await hasJobSeekerAccess(
      amResult.accountManager.id,
      thread.job_seeker_id
    );
    if (!hasAccess) {
      return Response.json({ success: false, error: "Not authorized." }, { status: 403 });
    }
  }

  const nowIso = new Date().toISOString();

  if (payload.recruiter_status) {
    await supabaseServer
      .from("recruiters")
      .update({
        status: payload.recruiter_status,
        updated_at: nowIso,
      })
      .eq("id", thread.recruiter_id);
  } else if (payload.mark_interview) {
    await supabaseServer
      .from("recruiters")
      .update({
        status: "INTERVIEWING",
        updated_at: nowIso,
      })
      .eq("id", thread.recruiter_id);
  }

  const threadUpdates: Record<string, unknown> = {
    updated_at: nowIso,
  };

  if (payload.thread_status) {
    threadUpdates.thread_status = payload.thread_status;
  }

  if (payload.mark_interview && !thread.interview_started_at) {
    threadUpdates.interview_started_at = nowIso;
  }

  if (payload.mark_offer && !thread.offer_received_at) {
    threadUpdates.offer_received_at = nowIso;
  }

  if (payload.close_reason !== undefined) {
    threadUpdates.close_reason = payload.close_reason;
  }

  if (
    payload.recruiter_status === "CLOSED" ||
    payload.thread_status === "CLOSED"
  ) {
    if (!thread.closed_at) {
      threadUpdates.closed_at = nowIso;
    }
    threadUpdates.thread_status = "CLOSED";
  }

  if (
    payload.mark_interview &&
    !payload.thread_status &&
    payload.recruiter_status !== "CLOSED"
  ) {
    threadUpdates.thread_status = "ACTIVE";
  }

  await supabaseServer.from("recruiter_threads").update(threadUpdates).eq("id", thread.id);

  await supabaseServer.from("outreach_plans").upsert(
    {
      recruiter_thread_id: thread.id,
      recruiter_id: thread.recruiter_id,
      job_seeker_id: thread.job_seeker_id,
      next_action:
        payload.mark_offer
          ? "OFFER_RECORDED"
          : payload.mark_interview
            ? "INTERVIEW_IN_PROGRESS"
            : payload.recruiter_status === "CLOSED"
              ? "CLOSED"
              : "WAIT_FOR_REPLY",
      updated_at: nowIso,
      generated_at: nowIso,
    },
    { onConflict: "recruiter_thread_id" }
  );

  const { data: updatedThread } = await supabaseServer
    .from("recruiter_threads")
    .select("*")
    .eq("id", thread.id)
    .single();

  return Response.json({ success: true, thread: updatedThread });
}
