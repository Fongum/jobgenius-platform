import { buildContactSuggestions, buildDraftEmail } from "@/lib/outreach";
import { buildInterviewPrepContent } from "@/lib/interview-prep";
import { fetchCompanyInfo } from "@/lib/company-info";
import { getActorFromHeaders } from "@/lib/actor";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { supabaseServer } from "@/lib/supabase/server";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { applicationAckEmail } from "@/lib/email-templates/application-ack";

type CompletePayload = {
  run_id?: string;
  claim_token?: string;
  note?: string;
  last_seen_url?: string;
};

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: CompletePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, job_seeker_id, job_post_id, ats_type, current_step, claim_token"
    )
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    run.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  if (requiresClaimToken(request.headers)) {
    if (!payload.claim_token) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== payload.claim_token) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: "APPLIED",
      needs_attention_reason: null,
      last_seen_url: payload.last_seen_url ?? null,
      locked_at: null,
      locked_by: null,
      claim_token: null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to complete run." },
      { status: 500 }
    );
  }

  if (run.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({ status: "APPLIED", category: "applied", updated_at: nowIso })
      .eq("id", run.queue_id);
  }

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "APPLIED",
    message: payload.note ?? "Marked applied.",
  });

  const actor = getActorFromHeaders(request.headers);

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "APPLIED",
    actor,
    payload: { note: payload.note ?? null },
  });

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("id, title, company, company_website, description_text, location")
    .eq("id", run.job_post_id)
    .single();

  const { data: jobSeeker } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, email, seniority, work_type")
    .eq("id", run.job_seeker_id)
    .single();

  if (jobPost && jobSeeker) {
    let scrapedEmails: string[] = [];
    if (jobPost.company_website) {
      const info = await fetchCompanyInfo(jobPost.company_website);
      scrapedEmails = info.emails;
      if (info.emails.length > 0 || info.pagesVisited.length > 0) {
        await supabaseServer.from("company_info").insert({
          company_website: jobPost.company_website,
          emails: info.emails,
          pages_visited: info.pagesVisited,
        });
      }
    }

    const rolePriority = [
      "Hiring Manager",
      "Recruiter/TA",
      "Department Head",
      "Team Lead/Manager",
    ];
    const suggestions = buildContactSuggestions({
      companyName: jobPost.company,
      companyWebsite: jobPost.company_website,
    });

    const scrapedContacts = scrapedEmails.slice(0, 2).map((email, index) => ({
      job_seeker_id: jobSeeker.id,
      job_post_id: jobPost.id,
      company_name: jobPost.company ?? null,
      role: rolePriority[index] ?? "Recruiter/TA",
      full_name: null,
      email,
      source: "scraped",
    }));

    const contactRows =
      scrapedContacts.length > 0
        ? scrapedContacts
        : suggestions.map((suggestion) => ({
            job_seeker_id: jobSeeker.id,
            job_post_id: jobPost.id,
            company_name: jobPost.company ?? null,
            role: suggestion.role,
            full_name: suggestion.full_name,
            email: suggestion.email,
            source: "generated",
          }));

    const { data: createdContacts } = await supabaseServer
      .from("outreach_contacts")
      .insert(contactRows)
      .select("id, role");

    const nowIsoInner = new Date().toISOString();
    const draftRows = (createdContacts ?? []).map((contact) => {
      const draft = buildDraftEmail({
        jobTitle: jobPost.title,
        companyName: jobPost.company,
        jobSeekerName: jobSeeker.full_name,
        contactRole: contact.role,
      });

      return {
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        contact_id: contact.id,
        subject: draft.subject,
        body: draft.body,
        status: "DRAFT",
        updated_at: nowIsoInner,
      };
    });

    if (draftRows.length > 0) {
      await supabaseServer
        .from("outreach_drafts")
        .upsert(draftRows, { onConflict: "job_seeker_id,job_post_id,contact_id" });
    }

    if (draftRows.length > 0) {
      await supabaseServer.from("apply_outbox").insert(
        draftRows.map((draft) => ({
          job_seeker_id: draft.job_seeker_id,
          job_post_id: draft.job_post_id,
          draft_id: null,
          provider: process.env.EMAIL_SEND_PROVIDER ?? "stub",
          status: "PENDING",
          request_payload: {
            subject: draft.subject,
          },
          updated_at: nowIsoInner,
        }))
      );
    }

    if (draftRows.length > 0) {
      const contactIds = (createdContacts ?? []).map((contact) => contact.id);
      enqueueBackgroundJob("AUTO_OUTREACH", {
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        ...(contactIds.length > 0 ? { contact_ids: contactIds } : {}),
      }).catch(() => {
        // Non-blocking: outreach scheduling should not break completion flow
      });
    }

    const prepContent = buildInterviewPrepContent({
      jobTitle: jobPost.title,
      companyName: jobPost.company,
      descriptionText: jobPost.description_text,
      location: jobPost.location,
      seniority: jobSeeker.seniority,
      workType: jobSeeker.work_type,
    });

    await supabaseServer.from("interview_prep").upsert(
      {
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        content: prepContent,
        updated_at: nowIsoInner,
      },
      { onConflict: "job_seeker_id,job_post_id" }
    );

    // Send application acknowledgement email to the job seeker
    if (jobSeeker.email) {
      const ackTemplate = applicationAckEmail({
        candidateName: jobSeeker.full_name ?? "Candidate",
        jobTitle: jobPost.title,
        company: jobPost.company,
      });

      await sendAndLogEmail({
        to: jobSeeker.email,
        subject: ackTemplate.subject,
        html: ackTemplate.html,
        text: ackTemplate.text,
        template_key: "application_ack",
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        application_queue_id: run.queue_id ?? undefined,
      }).catch(() => {
        // Non-blocking: email failure should not break the application flow
      });
    }
  }

  return Response.json({
    success: true,
    run_id: run.id,
    status: "APPLIED",
  });
}
