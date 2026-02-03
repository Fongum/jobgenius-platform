import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { recordRecruiterOptOut } from "@/lib/outreach-consent";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

type OptOutPayload = {
  reason?: string;
};

export async function POST(
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

  let payload: OptOutPayload = {};
  try {
    payload = await request.json();
  } catch {
    // optional body
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
    .select("id, recruiter_id, job_seeker_id, recruiters (email)")
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

  const recruiter = Array.isArray(thread.recruiters)
    ? thread.recruiters[0]
    : thread.recruiters;

  await recordRecruiterOptOut({
    recruiterId: thread.recruiter_id,
    recruiterThreadId: thread.id,
    email: recruiter?.email ?? null,
    reason: payload.reason ?? "manual_opt_out",
    source: "am_manual",
  });

  const nowIso = new Date().toISOString();
  await supabaseServer
    .from("recruiter_threads")
    .update({
      thread_status: "CLOSED",
      close_reason: "OPT_OUT",
      closed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", thread.id);

  await supabaseServer
    .from("recruiters")
    .update({
      status: "CLOSED",
      updated_at: nowIso,
    })
    .eq("id", thread.recruiter_id);

  await supabaseServer
    .from("outreach_messages")
    .update({
      status: "OPTED_OUT",
      updated_at: nowIso,
    })
    .eq("recruiter_thread_id", thread.id)
    .in("status", ["QUEUED", "SENT", "DELIVERED", "OPENED", "FOLLOWUP_DUE"]);

  return Response.json({ success: true });
}
