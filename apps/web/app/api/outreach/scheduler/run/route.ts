import { getOutreachAdapter } from "@/lib/email/adapter";
import { getRecruiterOptOut } from "@/lib/outreach-consent";
import {
  buildAdaptiveFollowUpCopy,
  buildOutreachPlan,
  inferRecruiterType,
} from "@/lib/outreach-intelligence";
import {
  buildHtmlBodyWithTracking,
  buildTrackingOpenUrl,
  ensureTrackingToken,
} from "@/lib/outreach-email";
import { requireOpsAuth } from "@/lib/ops-auth";
import { canTransitionOutreachState } from "@/lib/outreach-state";
import { supabaseServer } from "@/lib/supabase/server";

type ThreadRow = {
  id: string;
  recruiter_id: string;
  job_seeker_id: string;
  thread_status: string;
  last_reply_at: string | null;
  recruiters:
    | {
        id: string;
        name: string | null;
        email: string | null;
        title: string | null;
        company: string | null;
        source: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        email: string | null;
        title: string | null;
        company: string | null;
        source: string | null;
      }>
    | null;
  job_seekers:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
};

type MessageRow = {
  id: string;
  recruiter_thread_id: string;
  sequence_id: string | null;
  step_number: number | null;
  status: string;
  subject: string | null;
  body: string | null;
  to_email: string | null;
  from_email: string | null;
  open_tracking_token: string | null;
  follow_up_tone: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  created_at: string;
};

function toSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function hoursSince(iso?: string | null) {
  if (!iso) {
    return 0;
  }
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(ms / (60 * 60 * 1000), 0);
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

async function upsertPlanForThread({
  thread,
  message,
  nowIso,
  nextAction,
}: {
  thread: ThreadRow;
  message: MessageRow | null;
  nowIso: string;
  nextAction: string;
}) {
  const recruiter = toSingle(thread.recruiters);
  const latestTouch = message?.opened_at ?? message?.sent_at ?? message?.created_at ?? null;
  const hoursSinceLastOutbound = hoursSince(latestTouch);
  const hasReply = Boolean(message?.replied_at || thread.last_reply_at);
  const hasBounce = Boolean(message?.bounced_at || message?.status === "BOUNCED");
  const followUpCount = Math.max((message?.step_number ?? 1) - 1, 0);
  const hiringSignal = await resolveCompanyHiringSignal(recruiter?.company);
  const plan = buildOutreachPlan({
    recruiterTitle: recruiter?.title ?? null,
    wasOpened: Boolean(message?.opened_at),
    hasReply,
    hasBounce,
    stepNumber: (message?.step_number ?? 1) + 1,
    hoursSinceLastOutbound,
    followUpCount,
    companyName: recruiter?.company ?? null,
    openRoleCount: hiringSignal.openRoleCount,
    recentRoleTitle: hiringSignal.recentRoleTitle,
  });

  await supabaseServer
    .from("recruiter_threads")
    .update({
      ghosting_risk_score: plan.ghostingRiskScore,
      updated_at: nowIso,
    })
    .eq("id", thread.id);

  await supabaseServer.from("outreach_plans").upsert(
    {
      recruiter_thread_id: thread.id,
      recruiter_id: thread.recruiter_id,
      job_seeker_id: thread.job_seeker_id,
      sequence_id: message?.sequence_id ?? null,
      recruiter_type: inferRecruiterType(recruiter?.title),
      preferred_tone: plan.preferredTone,
      company_signal: plan.companySignal,
      personalization: {
        recruiter_source: recruiter?.source ?? "manual",
      },
      ghosting_risk_score: plan.ghostingRiskScore,
      next_action: nextAction,
      plan_version: "v1",
      generated_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "recruiter_thread_id" }
  );
}

async function runScheduler(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const noReplyHours = Number(process.env.OUTREACH_NO_REPLY_HOURS ?? 72);
  const openedNoReplyHours = Number(process.env.OUTREACH_OPENED_NO_REPLY_HOURS ?? 36);
  const maxFollowUps = Number(process.env.OUTREACH_MAX_FOLLOWUPS ?? 2);
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const { data: activeThreads } = await supabaseServer
    .from("recruiter_threads")
    .select(
      "id, recruiter_id, job_seeker_id, thread_status, last_reply_at, recruiters (id, name, email, title, company, source), job_seekers (full_name, email)"
    )
    .in("thread_status", ["WAITING_REPLY", "FOLLOW_UP_DUE"])
    .limit(200);

  const threadRows = (activeThreads ?? []) as ThreadRow[];
  const threadIds = threadRows.map((row) => row.id);

  let messageRows: MessageRow[] = [];
  if (threadIds.length > 0) {
    const { data: messages } = await supabaseServer
      .from("outreach_messages")
      .select(
        "id, recruiter_thread_id, sequence_id, step_number, status, subject, body, to_email, from_email, open_tracking_token, follow_up_tone, scheduled_for, sent_at, opened_at, replied_at, bounced_at, created_at"
      )
      .eq("direction", "OUTBOUND")
      .in("recruiter_thread_id", threadIds)
      .order("created_at", { ascending: false });

    messageRows = (messages ?? []) as MessageRow[];
  }

  const messagesByThread = new Map<string, MessageRow[]>();
  for (const row of messageRows) {
    const list = messagesByThread.get(row.recruiter_thread_id) ?? [];
    list.push(row);
    messagesByThread.set(row.recruiter_thread_id, list);
  }

  const autoFollowUpRows: Array<Record<string, unknown>> = [];
  const dueThreadIds: string[] = [];

  for (const thread of threadRows) {
    const recruiter = toSingle(thread.recruiters);
    const seeker = toSingle(thread.job_seekers);
    if (!recruiter?.id || !recruiter.email) {
      continue;
    }

    const optOutStatus = await getRecruiterOptOut(recruiter.id);
    if (optOutStatus.optedOut) {
      await supabaseServer
        .from("recruiter_threads")
        .update({
          thread_status: "CLOSED",
          close_reason: "OPT_OUT",
          closed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", thread.id);
      continue;
    }

    const threadMessages = messagesByThread.get(thread.id) ?? [];
    if (threadMessages.length === 0) {
      continue;
    }

    const latest = threadMessages[0];
    await upsertPlanForThread({
      thread,
      message: latest,
      nowIso,
      nextAction: "WAIT_FOR_REPLY",
    });

    const closedStates = ["REPLIED", "BOUNCED", "OPTED_OUT", "CLOSED"];
    if (closedStates.includes(latest.status)) {
      continue;
    }

    const hasQueued = threadMessages.some((msg) => msg.status === "QUEUED");
    const followUpCount = threadMessages.filter((msg) => (msg.step_number ?? 1) > 1).length;
    const lastTouch = latest.opened_at ?? latest.sent_at ?? latest.created_at;
    const elapsedHours = hoursSince(lastTouch);
    const threshold = latest.opened_at ? openedNoReplyHours : noReplyHours;
    const hasReply = threadMessages.some((msg) => msg.status === "REPLIED") || Boolean(thread.last_reply_at);

    if (hasReply || hasQueued || followUpCount >= maxFollowUps || elapsedHours < threshold) {
      continue;
    }

    const hiringSignal = await resolveCompanyHiringSignal(recruiter.company);
    const plan = buildOutreachPlan({
      recruiterTitle: recruiter.title,
      wasOpened: Boolean(latest.opened_at),
      hasReply: false,
      hasBounce: false,
      stepNumber: (latest.step_number ?? 1) + 1,
      hoursSinceLastOutbound: elapsedHours,
      followUpCount,
      companyName: recruiter.company,
      openRoleCount: hiringSignal.openRoleCount,
      recentRoleTitle: hiringSignal.recentRoleTitle,
    });

    const nextStepNumber = Math.max(...threadMessages.map((msg) => msg.step_number ?? 1)) + 1;
    const followUp = buildAdaptiveFollowUpCopy({
      recruiterName: recruiter.name ?? recruiter.email,
      companyName: recruiter.company,
      jobSeekerName: seeker?.full_name,
      previousSubject: latest.subject,
      stepNumber: nextStepNumber,
      tone: plan.preferredTone,
      companySignal: plan.companySignal,
    });

    // Resolve outreach adapter for this seeker to get the right from_email
    const { fromEmail: seekerFromEmail, provider: seekerProvider } =
      await getOutreachAdapter(thread.job_seeker_id);

    autoFollowUpRows.push({
      recruiter_thread_id: thread.id,
      sequence_id: latest.sequence_id ?? null,
      step_number: nextStepNumber,
      direction: "OUTBOUND",
      from_email: seekerFromEmail,
      to_email: recruiter.email,
      subject: followUp.subject,
      body: followUp.body,
      provider: seekerProvider,
      status: "QUEUED",
      follow_up_tone: plan.preferredTone,
      open_tracking_token: ensureTrackingToken(null),
      scheduled_for: nowIso,
      updated_at: nowIso,
    });
    dueThreadIds.push(thread.id);

    await supabaseServer.from("outreach_plans").upsert(
      {
        recruiter_thread_id: thread.id,
        recruiter_id: thread.recruiter_id,
        job_seeker_id: thread.job_seeker_id,
        sequence_id: latest.sequence_id ?? null,
        recruiter_type: inferRecruiterType(recruiter.title),
        preferred_tone: plan.preferredTone,
        company_signal: plan.companySignal,
        personalization: {
          recruiter_source: recruiter.source ?? "manual",
        },
        ghosting_risk_score: plan.ghostingRiskScore,
        next_action: "FOLLOW_UP_DUE",
        plan_version: "v1",
        generated_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "recruiter_thread_id" }
    );
  }

  let createdFollowUps = 0;
  if (autoFollowUpRows.length > 0) {
    const { data: inserted, error } = await supabaseServer
      .from("outreach_messages")
      .insert(autoFollowUpRows)
      .select("id");
    if (!error) {
      createdFollowUps = inserted?.length ?? 0;
    }
  }

  if (dueThreadIds.length > 0) {
    await supabaseServer
      .from("recruiter_threads")
      .update({
        thread_status: "FOLLOW_UP_DUE",
        next_follow_up_at: nowIso,
        updated_at: nowIso,
      })
      .in("id", dueThreadIds);
  }

  const { data: queuedMessages, error } = await supabaseServer
    .from("outreach_messages")
    .select(
      "id, recruiter_thread_id, sequence_id, step_number, status, subject, body, to_email, from_email, open_tracking_token, follow_up_tone, scheduled_for, sent_at, opened_at, replied_at, bounced_at, created_at"
    )
    .eq("status", "QUEUED")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Outreach scheduler queued message query failed:", error);
    return Response.json(
      {
        success: true,
        warning: "Failed to load queued messages.",
        followups_created: createdFollowUps,
        queued: 0,
        sent: 0,
        failed: 0,
        skipped_opt_out: 0,
      },
      { status: 200 }
    );
  }

  const queued = (queuedMessages ?? []) as MessageRow[];
  const queuedThreadIds = Array.from(
    new Set(queued.map((msg) => msg.recruiter_thread_id))
  );
  let queuedThreadRows: ThreadRow[] = [];
  if (queuedThreadIds.length > 0) {
    const { data } = await supabaseServer
      .from("recruiter_threads")
      .select(
        "id, recruiter_id, job_seeker_id, thread_status, last_reply_at, recruiters (id, name, email, title, company, source), job_seekers (full_name, email)"
      )
      .in("id", queuedThreadIds);
    queuedThreadRows = (data ?? []) as ThreadRow[];
  }

  const threadMap = new Map<string, ThreadRow>();
  for (const row of queuedThreadRows) {
    threadMap.set(row.id, row);
  }

  // Cache outreach adapters per seeker
  const adapterCache = new Map<
    string,
    Awaited<ReturnType<typeof getOutreachAdapter>>
  >();
  let sent = 0;
  let failed = 0;
  let skippedOptOut = 0;

  for (const message of queued) {
    const thread = threadMap.get(message.recruiter_thread_id);
    const recruiter = toSingle(thread?.recruiters ?? null);
    const seeker = toSingle(thread?.job_seekers ?? null);

    if (!thread || !recruiter?.id || !recruiter.email) {
      failed += 1;
      await supabaseServer
        .from("outreach_messages")
        .update({
          status: "FAILED",
          meta: { error: "Missing recruiter thread context." },
          updated_at: nowIso,
        })
        .eq("id", message.id);
      continue;
    }

    const optOutStatus = await getRecruiterOptOut(recruiter.id);
    if (optOutStatus.optedOut) {
      skippedOptOut += 1;
      await supabaseServer
        .from("outreach_messages")
        .update({
          status: "OPTED_OUT",
          updated_at: nowIso,
        })
        .eq("id", message.id);
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
        .eq("id", recruiter.id);
      continue;
    }

    if (!message.to_email || !message.from_email) {
      failed += 1;
      await supabaseServer
        .from("outreach_messages")
        .update({
          status: "FAILED",
          meta: { error: "Missing from/to email." },
          updated_at: nowIso,
        })
        .eq("id", message.id);
      continue;
    }

    if (!canTransitionOutreachState(message.status, "SENT")) {
      failed += 1;
      await supabaseServer
        .from("outreach_messages")
        .update({
          status: "FAILED",
          meta: { error: `Invalid state transition from ${message.status} to SENT.` },
          updated_at: nowIso,
        })
        .eq("id", message.id);
      continue;
    }

    const trackingToken = ensureTrackingToken(message.open_tracking_token);
    const trackingUrl = buildTrackingOpenUrl({ token: trackingToken, requestUrl: request.url });
    const htmlBody = buildHtmlBodyWithTracking(message.body ?? "", trackingUrl);

    // Resolve outreach adapter per seeker (cached)
    if (!adapterCache.has(thread.job_seeker_id)) {
      adapterCache.set(thread.job_seeker_id, await getOutreachAdapter(thread.job_seeker_id));
    }
    const { adapter: outreachAdapter } = adapterCache.get(thread.job_seeker_id)!;

    const result = await outreachAdapter.sendEmail({
      from: message.from_email,
      to: [message.to_email],
      subject: message.subject ?? "Follow-up from JobGenius",
      text: message.body ?? "",
      html: htmlBody,
      replyTo: seeker?.email ?? undefined,
      metadata: {
        recruiter_thread_id: message.recruiter_thread_id,
        outreach_message_id: message.id,
        open_tracking_token: trackingToken,
      },
    });

    if (!result.ok) {
      failed += 1;
      await supabaseServer
        .from("outreach_messages")
        .update({
          status: "FAILED",
          meta: { error: result.detail ?? "Send failed." },
          updated_at: nowIso,
        })
        .eq("id", message.id);
      continue;
    }

    sent += 1;
    await supabaseServer
      .from("outreach_messages")
      .update({
        status: "SENT",
        provider_message_id: result.provider_message_id ?? null,
        open_tracking_token: trackingToken,
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", message.id);

    const nextFollowUpAt = new Date(nowMs + noReplyHours * 60 * 60 * 1000).toISOString();
    await supabaseServer
      .from("recruiter_threads")
      .update({
        thread_status: "WAITING_REPLY",
        last_message_direction: "OUTBOUND",
        next_follow_up_at: nextFollowUpAt,
        updated_at: nowIso,
      })
      .eq("id", message.recruiter_thread_id);

    await supabaseServer
      .from("recruiters")
      .update({
        status: "CONTACTED",
        last_contacted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", thread.recruiter_id);

    await upsertPlanForThread({
      thread,
      message: { ...message, open_tracking_token: trackingToken },
      nowIso,
      nextAction: "WAIT_FOR_REPLY",
    });
  }

  return Response.json({
    success: true,
    followups_created: createdFollowUps,
    queued: queued.length,
    sent,
    failed,
    skipped_opt_out: skippedOptOut,
  });
}

export async function POST(request: Request) {
  return runScheduler(request);
}

export async function GET(request: Request) {
  return runScheduler(request);
}
