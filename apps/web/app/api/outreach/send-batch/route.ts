import { getAccountManagerFromRequest } from "@/lib/am-access";
import { getEmailAdapter } from "@/lib/email/adapter";
import { assertOutreachConsent } from "@/lib/outreach-consent";
import {
  buildHtmlBodyWithTracking,
  buildTrackingOpenUrl,
  ensureTrackingToken,
} from "@/lib/outreach-email";
import { supabaseServer } from "@/lib/supabase/server";

type SendBatchPayload = {
  draft_ids?: string[];
  all_pending?: boolean;
};

export async function POST(request: Request) {
  let payload: SendBatchPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.draft_ids?.length && !payload?.all_pending) {
    return Response.json(
      { success: false, error: "Provide draft_ids or set all_pending: true." },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json(
      { success: false, error: amResult.error },
      { status: 401 }
    );
  }

  const amId = amResult.accountManager.id;

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", amId);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seeker assignments." },
      { status: 500 }
    );
  }

  const assignedIds = (assignments ?? []).map((row) => row.job_seeker_id);

  if (assignedIds.length === 0) {
    return Response.json({
      success: true,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    });
  }

  // Fetch drafts
  type DraftRow = {
    id: string;
    job_seeker_id: string;
    job_post_id: string;
    subject: string | null;
    body: string | null;
    status: string;
    contact_id: string | null;
    outreach_contacts: {
      id: string;
      full_name: string | null;
      email: string | null;
      role: string | null;
      company_name: string | null;
    } | null;
  };

  let drafts: DraftRow[] = [];

  if (payload.all_pending) {
    const { data, error } = await supabaseServer
      .from("outreach_drafts")
      .select(
        "id, job_seeker_id, job_post_id, subject, body, status, contact_id, outreach_contacts(id, full_name, email, role, company_name)"
      )
      .in("job_seeker_id", assignedIds)
      .in("status", ["draft", "DRAFT"]);

    if (error) {
      return Response.json(
        { success: false, error: "Failed to fetch drafts." },
        { status: 500 }
      );
    }
    drafts = (data ?? []) as unknown as DraftRow[];
  } else if (payload.draft_ids?.length) {
    const { data, error } = await supabaseServer
      .from("outreach_drafts")
      .select(
        "id, job_seeker_id, job_post_id, subject, body, status, contact_id, outreach_contacts(id, full_name, email, role, company_name)"
      )
      .in("id", payload.draft_ids);

    if (error) {
      return Response.json(
        { success: false, error: "Failed to fetch drafts." },
        { status: 500 }
      );
    }
    drafts = ((data ?? []) as unknown as DraftRow[]).filter((d) =>
      assignedIds.includes(d.job_seeker_id)
    );
  }

  if (drafts.length === 0) {
    return Response.json({
      success: true,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    });
  }

  const fromEmail = process.env.OUTREACH_FROM_EMAIL;
  if (!fromEmail) {
    return Response.json(
      { success: false, error: "Missing OUTREACH_FROM_EMAIL." },
      { status: 500 }
    );
  }

  const adapter = getEmailAdapter();
  const nowIso = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Cache consent checks per seeker
  const consentCache = new Map<string, boolean>();

  for (const draft of drafts) {
    const contactEmail = draft.outreach_contacts?.email;
    if (!contactEmail) {
      skipped++;
      continue;
    }

    if (!draft.subject || !draft.body) {
      skipped++;
      continue;
    }

    // Check consent (cached per seeker)
    if (!consentCache.has(draft.job_seeker_id)) {
      const consentResult = await assertOutreachConsent(draft.job_seeker_id);
      consentCache.set(draft.job_seeker_id, consentResult.ok);
    }

    if (!consentCache.get(draft.job_seeker_id)) {
      skipped++;
      continue;
    }

    // Find or create recruiter
    const contactName = draft.outreach_contacts?.full_name ?? null;
    const contactRole = draft.outreach_contacts?.role ?? null;
    const companyName = draft.outreach_contacts?.company_name ?? null;

    const { data: existingRecruiter } = await supabaseServer
      .from("recruiters")
      .select("id")
      .eq("email", contactEmail)
      .maybeSingle();

    let recruiterId: string;
    if (existingRecruiter) {
      recruiterId = existingRecruiter.id;
    } else {
      const { data: created, error: createErr } = await supabaseServer
        .from("recruiters")
        .insert({
          email: contactEmail,
          name: contactName,
          title: contactRole,
          company: companyName,
          source: "outreach_batch",
          status: "NEW",
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (createErr || !created) {
        failed++;
        errors.push(`Failed to create recruiter for draft ${draft.id}.`);
        continue;
      }
      recruiterId = created.id;
    }

    // Find or create recruiter thread
    const { data: existingThread } = await supabaseServer
      .from("recruiter_threads")
      .select("id")
      .eq("recruiter_id", recruiterId)
      .eq("job_seeker_id", draft.job_seeker_id)
      .maybeSingle();

    let threadId: string;
    if (existingThread) {
      threadId = existingThread.id;
    } else {
      const { data: createdThread, error: threadErr } = await supabaseServer
        .from("recruiter_threads")
        .insert({
          recruiter_id: recruiterId,
          job_seeker_id: draft.job_seeker_id,
          thread_status: "ACTIVE",
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (threadErr || !createdThread) {
        failed++;
        errors.push(`Failed to create thread for draft ${draft.id}.`);
        continue;
      }
      threadId = createdThread.id;
    }

    // Create outreach message
    const trackingToken = ensureTrackingToken();
    const trackingUrl = buildTrackingOpenUrl({
      token: trackingToken,
      requestUrl: request.url,
    });
    const htmlBody = buildHtmlBodyWithTracking(draft.body, trackingUrl);

    const { data: message, error: msgErr } = await supabaseServer
      .from("outreach_messages")
      .insert({
        recruiter_thread_id: threadId,
        direction: "OUTBOUND",
        from_email: fromEmail,
        to_email: contactEmail,
        subject: draft.subject,
        body: draft.body,
        provider: process.env.EMAIL_SEND_PROVIDER ?? "stub",
        status: "QUEUED",
        step_number: 1,
        scheduled_for: nowIso,
        open_tracking_token: trackingToken,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (msgErr || !message) {
      failed++;
      errors.push(`Failed to create message for draft ${draft.id}.`);
      continue;
    }

    // Send email
    const result = await adapter.sendEmail({
      from: fromEmail,
      to: [contactEmail],
      subject: draft.subject,
      text: draft.body,
      html: htmlBody,
      metadata: {
        recruiter_thread_id: threadId,
        outreach_message_id: message.id,
        open_tracking_token: trackingToken,
      },
    });

    if (!result.ok) {
      failed++;
      errors.push(`Send failed for draft ${draft.id}: ${result.detail ?? "Unknown error"}`);

      await supabaseServer
        .from("outreach_messages")
        .update({ status: "FAILED", updated_at: nowIso })
        .eq("id", message.id);

      continue;
    }

    // Update message to SENT
    await supabaseServer
      .from("outreach_messages")
      .update({
        status: "SENT",
        provider_message_id: result.provider_message_id ?? null,
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", message.id);

    // Update draft to sent
    await supabaseServer
      .from("outreach_drafts")
      .update({ status: "sent", updated_at: nowIso })
      .eq("id", draft.id);

    // Update thread status
    const noReplyHours = Number(process.env.OUTREACH_NO_REPLY_HOURS ?? 72);
    const nextFollowUpAt = new Date(
      Date.now() + noReplyHours * 60 * 60 * 1000
    ).toISOString();

    await supabaseServer
      .from("recruiter_threads")
      .update({
        thread_status: "WAITING_REPLY",
        last_message_direction: "OUTBOUND",
        next_follow_up_at: nextFollowUpAt,
        updated_at: nowIso,
      })
      .eq("id", threadId);

    // Update recruiter status
    await supabaseServer
      .from("recruiters")
      .update({
        status: "CONTACTED",
        last_contacted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", recruiterId);

    sent++;
  }

  return Response.json({
    success: true,
    sent,
    failed,
    skipped,
    errors,
  });
}
