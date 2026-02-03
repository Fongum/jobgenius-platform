import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { shortlistNotificationEmail } from "@/lib/email-templates/shortlist-notification";
import { rejectionFeedbackEmail } from "@/lib/email-templates/rejection-feedback";
import { offerNotificationEmail } from "@/lib/email-templates/offer-notification";

type StatusPayload = {
  queue_id: string;
  status: "SHORTLISTED" | "REJECTED" | "HIRED";
  send_email?: boolean;
  feedback?: string;
};

export async function POST(request: Request) {
  let payload: StatusPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload?.queue_id || !payload?.status) {
    return Response.json(
      { success: false, error: "Missing queue_id or status." },
      { status: 400 }
    );
  }

  if (!["SHORTLISTED", "REJECTED", "HIRED"].includes(payload.status)) {
    return Response.json(
      { success: false, error: "Invalid status. Must be SHORTLISTED, REJECTED, or HIRED." },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: queueItem, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_seeker_id, job_post_id, status")
    .eq("id", payload.queue_id)
    .single();

  if (queueError || !queueItem) {
    return Response.json({ success: false, error: "Queue item not found." }, { status: 404 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    queueItem.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabaseServer
    .from("application_queue")
    .update({
      status: payload.status,
      category: payload.status.toLowerCase(),
      updated_at: nowIso,
    })
    .eq("id", queueItem.id);

  if (updateError) {
    return Response.json(
      { success: false, error: "Failed to update status." },
      { status: 500 }
    );
  }

  // Send email if requested (defaults to true)
  const shouldSendEmail = payload.send_email !== false;

  if (shouldSendEmail) {
    const { data: seeker } = await supabaseServer
      .from("job_seekers")
      .select("full_name, email")
      .eq("id", queueItem.job_seeker_id)
      .single();

    const { data: jobPost } = await supabaseServer
      .from("job_posts")
      .select("title, company")
      .eq("id", queueItem.job_post_id)
      .single();

    if (seeker?.email && jobPost) {
      const candidateName = seeker.full_name ?? "Candidate";

      if (payload.status === "SHORTLISTED") {
        const template = shortlistNotificationEmail({
          candidateName,
          jobTitle: jobPost.title,
          company: jobPost.company,
        });
        await sendAndLogEmail({
          to: seeker.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          template_key: "shortlist_notification",
          job_seeker_id: queueItem.job_seeker_id,
          job_post_id: queueItem.job_post_id,
          application_queue_id: queueItem.id,
        }).catch(() => {});
      }

      if (payload.status === "REJECTED") {
        const template = rejectionFeedbackEmail({
          candidateName,
          jobTitle: jobPost.title,
          company: jobPost.company,
          feedback: payload.feedback ?? null,
        });
        await sendAndLogEmail({
          to: seeker.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          template_key: "rejection_feedback",
          job_seeker_id: queueItem.job_seeker_id,
          job_post_id: queueItem.job_post_id,
          application_queue_id: queueItem.id,
        }).catch(() => {});
      }

      if (payload.status === "HIRED") {
        const template = offerNotificationEmail({
          candidateName,
          jobTitle: jobPost.title,
          company: jobPost.company,
        });
        await sendAndLogEmail({
          to: seeker.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          template_key: "offer_notification",
          job_seeker_id: queueItem.job_seeker_id,
          job_post_id: queueItem.job_post_id,
          application_queue_id: queueItem.id,
        }).catch(() => {});
      }
    }
  }

  return Response.json({ success: true, status: payload.status });
}
