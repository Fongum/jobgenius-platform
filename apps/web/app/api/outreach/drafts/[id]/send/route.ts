import { getEmailAdapter } from "@/lib/email/adapter";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const draftId = context.params.id;
  if (!draftId) {
    return Response.json(
      { success: false, error: "Missing draft id." },
      { status: 400 }
    );
  }

  const { data: draft, error: draftError } = await supabaseServer
    .from("outreach_drafts")
    .select(
      "id, job_seeker_id, job_post_id, subject, body, status, outreach_contacts (email), job_seekers (email)"
    )
    .eq("id", draftId)
    .single();

  if (draftError || !draft) {
    return Response.json(
      { success: false, error: "Draft not found." },
      { status: 404 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    draft.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const contact = Array.isArray(draft.outreach_contacts)
    ? draft.outreach_contacts[0]
    : draft.outreach_contacts;
  const jobSeeker = Array.isArray(draft.job_seekers)
    ? draft.job_seekers[0]
    : draft.job_seekers;

  if (!contact?.email) {
    return Response.json(
      { success: false, error: "Draft contact is missing an email address." },
      { status: 400 }
    );
  }

  if (!jobSeeker?.email) {
    return Response.json(
      { success: false, error: "Job seeker email is missing." },
      { status: 400 }
    );
  }

  const adapter = getEmailAdapter();
  const result = await adapter.send({
    from: jobSeeker.email,
    to: [contact.email],
    subject: draft.subject ?? "",
    body: draft.body ?? "",
  });

  const nowIso = new Date().toISOString();

  if (!result.ok) {
    await supabaseServer
      .from("outreach_drafts")
      .update({ status: "FAILED", last_error: result.detail ?? "Send failed.", updated_at: nowIso })
      .eq("id", draft.id);

    return Response.json(
      { success: false, error: result.detail ?? "Send failed." },
      { status: 500 }
    );
  }

  await supabaseServer
    .from("outreach_drafts")
    .update({ status: "SENT", sent_at: nowIso, updated_at: nowIso, last_error: null })
    .eq("id", draft.id);

  return Response.json({ success: true, provider: result.provider, message_id: result.messageId });
}
