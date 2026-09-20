import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { profileCompletionNudgeEmail } from "@/lib/email-templates/profile-completion-nudge";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

// GET /api/cron/profile-nudge
// Daily cron at 10:00 UTC — emails seekers with profile_completion < 80%
// who have not received a nudge email in the last 7 days.
//
// Auth: same as the sibling crons — the Vercel cron header or a matching
// `Authorization: Bearer <CRON_SECRET>`. It fails CLOSED: with CRON_SECRET unset
// and no cron header the request is rejected. (It used to skip the check
// entirely when CRON_SECRET was unset, leaving an unauthenticated endpoint that
// sends email to every seeker.)
function isAuthorizedCron(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// The audit table is public.cron_runs (migration 058). It has no job_name or
// summary column, so the previous inserts failed silently and this cron never
// appeared in its own audit log.
async function logCronRun(row: {
  startedAt: string;
  status: "success" | "error";
  fetched: number;
  inserted: number;
  errors: number;
  errorMessage?: string;
  sourceCounts: Record<string, number>;
}) {
  const { error } = await supabaseAdmin.from("cron_runs").insert({
    started_at: row.startedAt,
    completed_at: new Date().toISOString(),
    status: row.status,
    triggered_by: "vercel-cron",
    fetched: row.fetched,
    inserted: row.inserted,
    errors: row.errors,
    source_counts: row.sourceCounts,
    error_message: row.errorMessage ?? null,
  });

  if (error) {
    console.error("[cron:profile-nudge] failed to log cron run:", error);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  // Same fallback chain the interview-prep email uses; production sets
  // NEXT_PUBLIC_SITE_URL, not NEXT_PUBLIC_APP_URL.
  const portalUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://app.jobgenius.ai";
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find active seekers with profile_completion < 80
  const { data: seekers, error } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, profile_completion")
    .eq("status", "active")
    .lt("profile_completion", 80)
    .not("email", "is", null);

  if (error) {
    console.error("[cron:profile-nudge] failed to load seekers:", error);
    await logCronRun({
      startedAt,
      status: "error",
      fetched: 0,
      inserted: 0,
      errors: 1,
      errorMessage: `Failed to load seekers: ${error.message}`.slice(0, 500),
      sourceCounts: { profile_nudge: 0 },
    });
    return NextResponse.json({ error: "Failed to load seekers." }, { status: 500 });
  }

  if (!seekers || seekers.length === 0) {
    await logCronRun({
      startedAt,
      status: "success",
      fetched: 0,
      inserted: 0,
      errors: 0,
      sourceCounts: { profile_nudge: 0 },
    });
    return NextResponse.json({ sent: 0 });
  }

  // Filter: skip seekers emailed in last 7 days with this template
  const seekerIds = seekers.map((s) => s.id);
  const { data: recentLogs } = await supabaseAdmin
    .from("email_logs")
    .select("job_seeker_id")
    .in("job_seeker_id", seekerIds)
    .eq("template_key", "profile_completion_nudge")
    .gte("created_at", sevenDaysAgo);

  const recentlySent = new Set((recentLogs ?? []).map((r) => r.job_seeker_id));
  const toNudge = seekers.filter((s) => !recentlySent.has(s.id));

  let sent = 0;
  const errors: string[] = [];

  for (const seeker of toNudge) {
    if (!seeker.email) continue;
    try {
      const { subject, html, text } = profileCompletionNudgeEmail({
        seekerName: seeker.full_name ?? "there",
        completionPercent: seeker.profile_completion ?? 0,
        portalUrl,
      });

      const result = await sendAndLogEmail({
        to: seeker.email,
        subject,
        html,
        text,
        template_key: "profile_completion_nudge",
        job_seeker_id: seeker.id,
      });

      if (result.ok) {
        sent++;
      } else {
        // A failed send used to vanish: it was neither sent nor recorded as an error.
        errors.push(`${seeker.id}: send failed`);
      }
    } catch (e) {
      errors.push(`${seeker.id}: ${String(e)}`);
    }
  }

  await logCronRun({
    startedAt,
    status: errors.length > 0 ? "error" : "success",
    fetched: seekers.length,
    inserted: sent,
    errors: errors.length,
    errorMessage: errors.length > 0 ? errors.join("; ").slice(0, 500) : undefined,
    sourceCounts: { profile_nudge: sent, eligible: toNudge.length },
  });

  return NextResponse.json({
    sent,
    eligible: toNudge.length,
    total_found: seekers.length,
    errors: errors.length,
  });
}
