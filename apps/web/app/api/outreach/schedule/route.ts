import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { getEmailAdapter } from "@/lib/email/adapter";
import { assertOutreachConsent, getRecruiterOptOut } from "@/lib/outreach-consent";
import { buildOutreachPlan, inferPreferredTone, inferRecruiterType } from "@/lib/outreach-intelligence";
import {
  buildHtmlBodyWithTracking,
  buildTrackingOpenUrl,
  ensureTrackingToken,
} from "@/lib/outreach-email";
import { requireOpsAuth } from "@/lib/ops-auth";
import { canTransitionOutreachState } from "@/lib/outreach-state";
import { supabaseServer } from "@/lib/supabase/server";

type SchedulePayload = {
  recruiter_thread_id?: string;
  recruiter_id?: string;
  job_seeker_id?: string;
  sequence_id?: string;
  send_now?: boolean;
};

type SequenceStep = {
  id: string;
  step_number: number;
  delay_hours: number;
  delay_days: number | null;
  template_type: string | null;
  subject_template: string;
  body_template: string;
};

function renderTemplate(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return context[key] ?? "";
  });
}

async function resolveCompanyHiringSignal(companyName?: string | null) {
  if (!companyName) {
    return { openRoleCount: 0, recentRoleTitle: null as string | null };
  }

  const { data: roles } = await supabaseServer
    .from("job_posts")
    .select("title")
    .eq("company", companyName)
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    openRoleCount: roles?.length ?? 0,
    recentRoleTitle: roles?.[0]?.title ?? null,
  };
}

export async function POST(request: Request) {
  let payload: SchedulePayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload.sequence_id) {
    return Response.json({ success: false, error: "Missing sequence_id." }, { status: 400 });
  }

  const auth = requireOpsAuth(request.headers, request.url);
  let amResult: Awaited<ReturnType<typeof getAccountManagerFromRequest>> | null = null;
  if (!auth.ok) {
    amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
  }

  let threadId = payload.recruiter_thread_id ?? null;
  if (!threadId && payload.recruiter_id && payload.job_seeker_id) {
    const { data: existingThread } = await supabaseServer
      .from("recruiter_threads")
      .select("id")
      .eq("recruiter_id", payload.recruiter_id)
      .eq("job_seeker_id", payload.job_seeker_id)
      .maybeSingle();

    if (existingThread?.id) {
      threadId = existingThread.id;
    } else {
      const nowIso = new Date().toISOString();
      const { data: createdThread, error: createError } = await supabaseServer
        .from("recruiter_threads")
        .insert({
          recruiter_id: payload.recruiter_id,
          job_seeker_id: payload.job_seeker_id,
          thread_status: "ACTIVE",
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (createError || !createdThread) {
        return Response.json(
          { success: false, error: "Failed to create recruiter thread." },
          { status: 500 }
        );
      }
      threadId = createdThread.id;
    }
  }

  if (!threadId) {
    return Response.json({ success: false, error: "Missing recruiter_thread_id." }, { status: 400 });
  }

  const { data: thread, error: threadError } = await supabaseServer
    .from("recruiter_threads")
    .select("id, recruiter_id, job_seeker_id, thread_status")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return Response.json({ success: false, error: "Thread not found." }, { status: 404 });
  }

  if (amResult && !("error" in amResult)) {
    const hasAccess = await hasJobSeekerAccess(amResult.accountManager.id, thread.job_seeker_id);
    if (!hasAccess) {
      return Response.json({ success: false, error: "Not authorized." }, { status: 403 });
    }
  }

  if (thread.thread_status === "CLOSED") {
    return Response.json(
      { success: false, error: "Thread is closed. Reopen stage before scheduling." },
      { status: 409 }
    );
  }

  const consentCheck = await assertOutreachConsent(thread.job_seeker_id);
  if (!consentCheck.ok) {
    return Response.json({ success: false, error: consentCheck.error }, { status: 412 });
  }

  const { data: recruiter } = await supabaseServer
    .from("recruiters")
    .select("id, name, email, title, company, source")
    .eq("id", thread.recruiter_id)
    .single();

  if (!recruiter?.email) {
    return Response.json({ success: false, error: "Recruiter email missing." }, { status: 400 });
  }

  const optOutStatus = await getRecruiterOptOut(thread.recruiter_id);
  if (optOutStatus.optedOut) {
    return Response.json(
      { success: false, error: "Recruiter is opted out from outreach automation." },
      { status: 409 }
    );
  }

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("full_name, email")
    .eq("id", thread.job_seeker_id)
    .maybeSingle();

  const { data: steps, error: stepsError } = await supabaseServer
    .from("outreach_sequence_steps")
    .select(
      "id, step_number, delay_hours, delay_days, template_type, subject_template, body_template"
    )
    .eq("sequence_id", payload.sequence_id)
    .order("step_number", { ascending: true });

  if (stepsError || !steps || steps.length === 0) {
    return Response.json({ success: false, error: "Sequence steps not found." }, { status: 404 });
  }

  const pendingStatuses = ["QUEUED", "SENT", "DELIVERED", "OPENED", "FOLLOWUP_DUE"];
  const { data: existingPending } = await supabaseServer
    .from("outreach_messages")
    .select("id")
    .eq("recruiter_thread_id", thread.id)
    .eq("sequence_id", payload.sequence_id)
    .in("status", pendingStatuses)
    .limit(1);

  if ((existingPending ?? []).length > 0) {
    return Response.json(
      {
        success: false,
        error: "This sequence is already active for the recruiter thread.",
      },
      { status: 409 }
    );
  }

  const fromEmail = process.env.OUTREACH_FROM_EMAIL;
  if (!fromEmail) {
    return Response.json({ success: false, error: "Missing OUTREACH_FROM_EMAIL." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const hiringSignal = await resolveCompanyHiringSignal(recruiter.company);

  const stepRows = (steps as SequenceStep[]).map((step) => {
    const delayHours =
      typeof step.delay_days === "number" ? step.delay_days * 24 : step.delay_hours;
    const stepNumber = step.step_number ?? 1;
    const preferredTone = inferPreferredTone({
      recruiterType: inferRecruiterType(recruiter.title),
      wasOpened: false,
      stepNumber,
    });
    const plan = buildOutreachPlan({
      recruiterTitle: recruiter.title,
      wasOpened: false,
      hasReply: false,
      hasBounce: false,
      stepNumber,
      hoursSinceLastOutbound: 0,
      followUpCount: Math.max(stepNumber - 1, 0),
      companyName: recruiter.company,
      openRoleCount: hiringSignal.openRoleCount,
      recentRoleTitle: hiringSignal.recentRoleTitle,
    });

    const context = {
      recruiter_name: recruiter.name ?? recruiter.email,
      company_name: recruiter.company ?? "your team",
      job_seeker_name: seeker?.full_name ?? "our candidate",
      company_signal: plan.companySignal,
      preferred_tone: preferredTone,
    };

    const subject = renderTemplate(step.subject_template ?? "", context).trim();
    const body = renderTemplate(step.body_template ?? "", context).trim();
    const trackingToken = ensureTrackingToken(null);
    const scheduledFor = new Date(nowMs + delayHours * 60 * 60 * 1000).toISOString();

    return {
      recruiter_thread_id: thread.id,
      sequence_id: payload.sequence_id,
      step_number: stepNumber,
      direction: "OUTBOUND",
      from_email: fromEmail,
      to_email: recruiter.email,
      subject: subject || "Follow-up from JobGenius",
      body: body || "Quick follow-up from JobGenius.",
      provider: process.env.EMAIL_SEND_PROVIDER ?? "stub",
      status: "QUEUED",
      follow_up_tone: preferredTone,
      open_tracking_token: trackingToken,
      scheduled_for: scheduledFor,
      updated_at: nowIso,
    };
  });

  const { data: inserted, error: insertError } = await supabaseServer
    .from("outreach_messages")
    .insert(stepRows)
    .select("id, step_number, scheduled_for, status, open_tracking_token, subject, body");

  if (insertError || !inserted) {
    return Response.json(
      { success: false, error: "Failed to schedule outreach messages." },
      { status: 500 }
    );
  }

  const earliestScheduled = [...inserted]
    .map((row) => new Date(row.scheduled_for).getTime())
    .sort((a, b) => a - b)[0];

  await supabaseServer
    .from("recruiter_threads")
    .update({
      thread_status: payload.send_now ? "WAITING_REPLY" : "ACTIVE",
      next_follow_up_at: earliestScheduled ? new Date(earliestScheduled).toISOString() : null,
      updated_at: nowIso,
    })
    .eq("id", thread.id);

  const planForThread = buildOutreachPlan({
    recruiterTitle: recruiter.title,
    wasOpened: false,
    hasReply: false,
    hasBounce: false,
    stepNumber: 1,
    hoursSinceLastOutbound: 0,
    followUpCount: 0,
    companyName: recruiter.company,
    openRoleCount: hiringSignal.openRoleCount,
    recentRoleTitle: hiringSignal.recentRoleTitle,
  });

  await supabaseServer.from("outreach_plans").upsert(
    {
      recruiter_thread_id: thread.id,
      recruiter_id: thread.recruiter_id,
      job_seeker_id: thread.job_seeker_id,
      sequence_id: payload.sequence_id,
      recruiter_type: inferRecruiterType(recruiter.title),
      preferred_tone: planForThread.preferredTone,
      company_signal: planForThread.companySignal,
      personalization: {
        recruiter_source: recruiter.source ?? "manual",
      },
      ghosting_risk_score: planForThread.ghostingRiskScore,
      next_action: payload.send_now ? "WAIT_FOR_REPLY" : "SCHEDULED_SEQUENCE",
      plan_version: "v1",
      generated_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "recruiter_thread_id" }
  );

  let sendNowResult: { sent: boolean; message_id: string | null; error: string | null } | null = null;

  if (payload.send_now) {
    const firstStep = inserted
      .slice()
      .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))[0];

    if (firstStep) {
      if (canTransitionOutreachState(firstStep.status, "SENT")) {
        const trackingUrl = buildTrackingOpenUrl({
          token: firstStep.open_tracking_token ?? ensureTrackingToken(null),
          requestUrl: request.url,
        });
        const htmlBody = buildHtmlBodyWithTracking(firstStep.body ?? "", trackingUrl);

        const adapter = getEmailAdapter();
        const result = await adapter.sendEmail({
          from: fromEmail,
          to: [recruiter.email],
          subject: firstStep.subject ?? "Follow-up from JobGenius",
          text: firstStep.body ?? "",
          html: htmlBody,
          replyTo: seeker?.email ?? undefined,
          metadata: {
            recruiter_thread_id: thread.id,
            outreach_message_id: firstStep.id,
            open_tracking_token: firstStep.open_tracking_token ?? "",
          },
        });

        if (result.ok) {
          const noReplyHours = Number(process.env.OUTREACH_NO_REPLY_HOURS ?? 72);
          const nextFollowUpAt = new Date(Date.now() + noReplyHours * 60 * 60 * 1000).toISOString();

          await supabaseServer
            .from("outreach_messages")
            .update({
              status: "SENT",
              provider_message_id: result.provider_message_id ?? null,
              sent_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", firstStep.id);

          await supabaseServer
            .from("recruiter_threads")
            .update({
              thread_status: "WAITING_REPLY",
              last_message_direction: "OUTBOUND",
              next_follow_up_at: nextFollowUpAt,
              updated_at: nowIso,
            })
            .eq("id", thread.id);

          await supabaseServer
            .from("recruiters")
            .update({
              status: "CONTACTED",
              last_contacted_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", thread.recruiter_id);

          sendNowResult = { sent: true, message_id: firstStep.id, error: null };
        } else {
          await supabaseServer
            .from("outreach_messages")
            .update({
              status: "FAILED",
              meta: { error: result.detail ?? "Send failed." },
              updated_at: nowIso,
            })
            .eq("id", firstStep.id);

          sendNowResult = {
            sent: false,
            message_id: firstStep.id,
            error: result.detail ?? "Send failed.",
          };
        }
      } else {
        sendNowResult = {
          sent: false,
          message_id: firstStep.id,
          error: `Message cannot transition from ${firstStep.status} to SENT.`,
        };
      }
    }
  }

  return Response.json({
    success: true,
    messages: inserted ?? [],
    send_now: sendNowResult,
  });
}
