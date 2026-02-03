import { supabaseServer } from "@/lib/supabase/server";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { interviewConfirmedEmail } from "@/lib/email-templates/interview-confirmed";
import { buildIcsEvent, icsToDataUri } from "@/lib/interviews/ics-builder";

export async function POST(request: Request) {
  let body: { token?: string; slot_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.token || !body.slot_id) {
    return Response.json(
      { success: false, error: "Missing token or slot_id." },
      { status: 400 }
    );
  }

  // Validate token and get interview
  const { data: interview, error: intError } = await supabaseServer
    .from("interviews")
    .select("id, job_post_id, job_seeker_id, account_manager_id, interview_type, duration_min, meeting_link, phone_number, address, status, notes_for_candidate")
    .eq("candidate_token", body.token)
    .single();

  if (intError || !interview) {
    return Response.json({ success: false, error: "Invalid token." }, { status: 404 });
  }

  if (interview.status !== "pending_candidate") {
    return Response.json(
      { success: false, error: `Interview is already ${interview.status}.` },
      { status: 409 }
    );
  }

  // Verify the slot is offered for this interview
  const { data: offer } = await supabaseServer
    .from("interview_slot_offers")
    .select("id")
    .eq("interview_id", interview.id)
    .eq("slot_id", body.slot_id)
    .single();

  if (!offer) {
    return Response.json(
      { success: false, error: "Slot not offered for this interview." },
      { status: 400 }
    );
  }

  // Atomically book the slot
  const { data: booked, error: bookError } = await supabaseServer.rpc(
    "book_interview_slot",
    { p_slot_id: body.slot_id, p_interview_id: interview.id }
  );

  if (bookError || !booked) {
    return Response.json(
      { success: false, error: "Slot is no longer available. Please pick another." },
      { status: 409 }
    );
  }

  // Re-fetch interview with updated data
  const { data: updated } = await supabaseServer
    .from("interviews")
    .select("*, job_posts (title, company), job_seekers (full_name, email)")
    .eq("id", interview.id)
    .single();

  if (!updated) {
    return Response.json({ success: true, interview: null });
  }

  const jobPost = Array.isArray(updated.job_posts) ? updated.job_posts[0] : updated.job_posts;
  const seeker = Array.isArray(updated.job_seekers) ? updated.job_seekers[0] : updated.job_seekers;

  // Send confirmation emails
  if (seeker?.email && jobPost) {
    const ics = buildIcsEvent({
      summary: `Interview: ${jobPost.title} at ${jobPost.company ?? "Company"}`,
      description: `${updated.interview_type.replace("_", "-")} interview for ${jobPost.title}`,
      startAt: updated.scheduled_at,
      durationMin: updated.duration_min,
      location: updated.address,
      meetingLink: updated.meeting_link,
    });
    const icsUri = icsToDataUri(ics);

    const candidateEmail = interviewConfirmedEmail({
      recipientName: seeker.full_name ?? "Candidate",
      jobTitle: jobPost.title,
      company: jobPost.company,
      interviewType: updated.interview_type,
      scheduledAt: updated.scheduled_at,
      duration: updated.duration_min,
      meetingLink: updated.meeting_link,
      phoneNumber: updated.phone_number,
      address: updated.address,
      icsDataUri: icsUri,
    });

    await sendAndLogEmail({
      to: seeker.email,
      subject: candidateEmail.subject,
      html: candidateEmail.html,
      text: candidateEmail.text,
      template_key: "interview_confirmed",
      job_seeker_id: updated.job_seeker_id,
      job_post_id: updated.job_post_id,
      interview_id: updated.id,
    });
  }

  // Notify AM/recruiter
  const { data: am } = await supabaseServer
    .from("account_managers")
    .select("email, name")
    .eq("id", updated.account_manager_id)
    .single();

  if (am?.email && jobPost) {
    const amEmail = interviewConfirmedEmail({
      recipientName: am.name ?? "Hiring Team",
      jobTitle: jobPost.title,
      company: jobPost.company,
      interviewType: updated.interview_type,
      scheduledAt: updated.scheduled_at,
      duration: updated.duration_min,
      meetingLink: updated.meeting_link,
      phoneNumber: updated.phone_number,
      address: updated.address,
      icsDataUri: null,
    });

    await sendAndLogEmail({
      to: am.email,
      subject: amEmail.subject,
      html: amEmail.html,
      text: amEmail.text,
      template_key: "interview_confirmed",
      job_seeker_id: updated.job_seeker_id,
      job_post_id: updated.job_post_id,
      interview_id: updated.id,
    });
  }

  return Response.json({ success: true, interview: updated });
}
