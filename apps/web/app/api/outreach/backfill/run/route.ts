import { buildOutreachPlan } from "@/lib/outreach-intelligence";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

type ThreadRow = {
  id: string;
  recruiter_id: string;
  job_seeker_id: string;
  last_reply_at: string | null;
  thread_status: string;
  recruiters:
    | {
        title: string | null;
        company: string | null;
        source: string | null;
      }
    | Array<{
        title: string | null;
        company: string | null;
        source: string | null;
      }>
    | null;
};

type MessageRow = {
  id: string;
  recruiter_thread_id: string;
  sequence_id: string | null;
  step_number: number | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  bounced_at: string | null;
  replied_at: string | null;
  created_at: string;
};

type CompanySignal = {
  openRoleCount: number;
  recentRoleTitle: string | null;
};

function toSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hoursSince(timestamp?: string | null) {
  if (!timestamp) {
    return 0;
  }
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return 0;
  }
  return diffMs / (60 * 60 * 1000);
}

async function resolveCompanySignal(
  companyName: string | null | undefined,
  cache: Record<string, CompanySignal>
) {
  const normalized = (companyName ?? "").trim().toLowerCase();
  if (!normalized) {
    return {
      openRoleCount: 0,
      recentRoleTitle: null,
    };
  }

  if (cache[normalized]) {
    return cache[normalized];
  }

  const { data: roles } = await supabaseServer
    .from("job_posts")
    .select("title")
    .eq("company", companyName ?? "")
    .order("created_at", { ascending: false })
    .limit(5);

  const signal: CompanySignal = {
    openRoleCount: roles?.length ?? 0,
    recentRoleTitle: roles?.[0]?.title ?? null,
  };
  cache[normalized] = signal;
  return signal;
}

async function runBackfill(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") !== "false";
  const includeClosed = url.searchParams.get("include_closed") === "true";
  const limit = clamp(Number(url.searchParams.get("limit") ?? "250"), 1, 1000);
  const nowIso = new Date().toISOString();

  let threadQuery = supabaseServer
    .from("recruiter_threads")
    .select(
      "id, recruiter_id, job_seeker_id, last_reply_at, thread_status, recruiters (title, company, source)"
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!includeClosed) {
    threadQuery = threadQuery.neq("thread_status", "CLOSED");
  }

  const { data: threadData, error: threadError } = await threadQuery;
  if (threadError) {
    return Response.json(
      { success: false, error: "Failed to load recruiter threads." },
      { status: 500 }
    );
  }

  const threads = (threadData ?? []) as ThreadRow[];
  if (threads.length === 0) {
    return Response.json({
      success: true,
      dry_run: dryRun,
      processed: 0,
      upserted: 0,
      updated_threads: 0,
      sample: [],
    });
  }

  const threadIds = threads.map((thread) => thread.id);
  const { data: messageData } = await supabaseServer
    .from("outreach_messages")
    .select(
      "id, recruiter_thread_id, sequence_id, step_number, status, sent_at, opened_at, bounced_at, replied_at, created_at, direction"
    )
    .eq("direction", "OUTBOUND")
    .in("recruiter_thread_id", threadIds)
    .order("created_at", { ascending: false });

  const allMessages = (messageData ?? []) as MessageRow[];
  const messagesByThread: Record<string, MessageRow[]> = {};
  allMessages.forEach((message) => {
    if (!messagesByThread[message.recruiter_thread_id]) {
      messagesByThread[message.recruiter_thread_id] = [];
    }
    messagesByThread[message.recruiter_thread_id].push(message);
  });

  const companyCache: Record<string, CompanySignal> = {};
  const planRows: Array<Record<string, unknown>> = [];
  const threadRiskRows: Array<{ id: string; ghosting_risk_score: number }> = [];
  const sample: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (const thread of threads) {
    if (!thread.recruiter_id || !thread.job_seeker_id) {
      skipped += 1;
      continue;
    }

    const recruiter = toSingle(thread.recruiters);
    const messages = messagesByThread[thread.id] ?? [];
    const latestMessage = messages[0] ?? null;
    const highestStep = messages.reduce((maxStep, message) => {
      return Math.max(maxStep, message.step_number ?? 1);
    }, 1);

    const latestTouch =
      latestMessage?.opened_at ??
      latestMessage?.sent_at ??
      latestMessage?.created_at ??
      null;

    const hasReply =
      Boolean(thread.last_reply_at) ||
      messages.some(
        (message) => message.status === "REPLIED" || Boolean(message.replied_at)
      );
    const hasBounce = messages.some(
      (message) => message.status === "BOUNCED" || Boolean(message.bounced_at)
    );
    const wasOpened = messages.some((message) => Boolean(message.opened_at));
    const followUpCount = messages.filter(
      (message) => (message.step_number ?? 1) > 1
    ).length;

    const companySignal = await resolveCompanySignal(recruiter?.company, companyCache);
    const plan = buildOutreachPlan({
      recruiterTitle: recruiter?.title ?? null,
      wasOpened,
      hasReply,
      hasBounce,
      stepNumber: highestStep,
      hoursSinceLastOutbound: hoursSince(latestTouch),
      followUpCount,
      companyName: recruiter?.company ?? null,
      openRoleCount: companySignal.openRoleCount,
      recentRoleTitle: companySignal.recentRoleTitle,
    });

    const row = {
      recruiter_thread_id: thread.id,
      recruiter_id: thread.recruiter_id,
      job_seeker_id: thread.job_seeker_id,
      sequence_id: latestMessage?.sequence_id ?? null,
      recruiter_type: plan.recruiterType,
      preferred_tone: plan.preferredTone,
      company_signal: plan.companySignal,
      personalization: {
        recruiter_source: recruiter?.source ?? "unknown",
        backfilled_at: nowIso,
      },
      ghosting_risk_score: plan.ghostingRiskScore,
      next_action: hasReply ? "AM_HANDOFF" : plan.nextAction,
      plan_version: "v1-backfill",
      generated_at: nowIso,
      updated_at: nowIso,
    };
    planRows.push(row);
    threadRiskRows.push({
      id: thread.id,
      ghosting_risk_score: plan.ghostingRiskScore,
    });

    if (sample.length < 10) {
      sample.push({
        thread_id: thread.id,
        preferred_tone: plan.preferredTone,
        recruiter_type: plan.recruiterType,
        ghosting_risk_score: plan.ghostingRiskScore,
        next_action: hasReply ? "AM_HANDOFF" : plan.nextAction,
      });
    }
  }

  if (!dryRun && planRows.length > 0) {
    const { error: upsertError } = await supabaseServer
      .from("outreach_plans")
      .upsert(planRows, { onConflict: "recruiter_thread_id" });
    if (upsertError) {
      return Response.json(
        { success: false, error: "Failed to upsert outreach plans." },
        { status: 500 }
      );
    }

    for (const row of threadRiskRows) {
      await supabaseServer
        .from("recruiter_threads")
        .update({
          ghosting_risk_score: row.ghosting_risk_score,
          updated_at: nowIso,
        })
        .eq("id", row.id);
    }
  }

  return Response.json({
    success: true,
    dry_run: dryRun,
    include_closed: includeClosed,
    processed: threads.length,
    eligible: planRows.length,
    skipped,
    upserted: dryRun ? 0 : planRows.length,
    updated_threads: dryRun ? 0 : threadRiskRows.length,
    sample,
  });
}

export async function POST(request: Request) {
  return runBackfill(request);
}

export async function GET(request: Request) {
  return runBackfill(request);
}
