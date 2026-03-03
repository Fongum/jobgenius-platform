import { resolveJobTargetUrl } from "@/lib/job-url";
import { supabaseServer } from "@/lib/supabase/server";

type JobPostSummary = {
  url: string | null;
  source: string | null;
};

type RunRow = {
  id: string;
  status: string | null;
  ats_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  job_posts: JobPostSummary | JobPostSummary[] | null;
};

type PauseEventRow = {
  run_id: string | null;
  payload: Record<string, unknown> | null;
};

export type HostAnalyticsRow = {
  host: string;
  source: string | null;
  ats_types: string[];
  total_runs: number;
  converted_runs: number;
  active_runs: number;
  needs_attention_runs: number;
  failed_runs: number;
  conversion_rate: number;
  attention_rate: number;
  top_pause_reason: string | null;
  top_pause_count: number;
  last_attempted_at: string | null;
  last_applied_at: string | null;
};

function resolveSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseHost(rawUrl: string | null) {
  if (!rawUrl) {
    return null;
  }

  const resolved = resolveJobTargetUrl(rawUrl) || rawUrl;
  try {
    return new URL(resolved).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function toEpoch(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLater(current: string | null, candidate: string | null) {
  return toEpoch(candidate) > toEpoch(current) ? candidate : current;
}

export async function loadHostAnalytics(hours = 24, limit = 12) {
  const clampedHours = Math.max(hours, 1);
  const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000).toISOString();

  const { data: runs, error: runsError } = await supabaseServer
    .from("application_runs")
    .select("id, status, ats_type, created_at, updated_at, job_posts (url, source)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (runsError) {
    throw new Error("Failed to load application runs.");
  }

  const runRows = (runs ?? []) as RunRow[];
  if (runRows.length === 0) {
    return [] as HostAnalyticsRow[];
  }

  const runHostMap = new Map<string, string>();
  const runIds: string[] = [];
  const hostMap = new Map<string, HostAnalyticsRow>();

  for (const run of runRows) {
    const jobPost = resolveSingle(run.job_posts);
    const host = parseHost(jobPost?.url ?? null);
    if (!host) {
      continue;
    }

    runIds.push(run.id);
    runHostMap.set(run.id, host);

    const existing = hostMap.get(host) ?? {
      host,
      source: jobPost?.source ?? null,
      ats_types: [],
      total_runs: 0,
      converted_runs: 0,
      active_runs: 0,
      needs_attention_runs: 0,
      failed_runs: 0,
      conversion_rate: 0,
      attention_rate: 0,
      top_pause_reason: null,
      top_pause_count: 0,
      last_attempted_at: null,
      last_applied_at: null,
    };

    existing.total_runs += 1;
    existing.last_attempted_at = pickLater(
      existing.last_attempted_at,
      run.updated_at ?? run.created_at
    );

    const status = String(run.status ?? "").toUpperCase();
    if (status === "APPLIED" || status === "COMPLETED") {
      existing.converted_runs += 1;
      existing.last_applied_at = pickLater(existing.last_applied_at, run.updated_at);
    } else if (status === "NEEDS_ATTENTION") {
      existing.needs_attention_runs += 1;
    } else if (status === "FAILED" || status === "CANCELLED") {
      existing.failed_runs += 1;
    } else if (["RUNNING", "RETRYING", "READY"].includes(status)) {
      existing.active_runs += 1;
    }

    const atsType = String(run.ats_type ?? "").trim().toUpperCase();
    if (atsType && !existing.ats_types.includes(atsType)) {
      existing.ats_types.push(atsType);
    }

    hostMap.set(host, existing);
  }

  if (runIds.length === 0 || hostMap.size === 0) {
    return [];
  }

  const { data: pauseEvents, error: pauseError } = await supabaseServer
    .from("apply_run_events")
    .select("run_id, payload")
    .eq("event_type", "NEEDS_ATTENTION")
    .gte("ts", since)
    .in("run_id", runIds);

  if (pauseError) {
    throw new Error("Failed to load pause events.");
  }

  const pauseReasonMap = new Map<string, Map<string, number>>();
  for (const event of (pauseEvents ?? []) as PauseEventRow[]) {
    if (!event.run_id) {
      continue;
    }
    const host = runHostMap.get(event.run_id);
    if (!host) {
      continue;
    }

    const reason = String(event.payload?.reason ?? "UNKNOWN")
      .trim()
      .toUpperCase();
    if (!reason) {
      continue;
    }

    const hostReasons = pauseReasonMap.get(host) ?? new Map<string, number>();
    hostReasons.set(reason, (hostReasons.get(reason) ?? 0) + 1);
    pauseReasonMap.set(host, hostReasons);
  }

  const rows = Array.from(hostMap.values()).map((row) => {
    row.ats_types.sort();
    row.conversion_rate =
      row.total_runs > 0 ? (row.converted_runs / row.total_runs) * 100 : 0;
    row.attention_rate =
      row.total_runs > 0 ? (row.needs_attention_runs / row.total_runs) * 100 : 0;

    const hostReasons = Array.from((pauseReasonMap.get(row.host) ?? new Map()).entries()).sort(
      (a, b) => b[1] - a[1]
    );
    if (hostReasons.length > 0) {
      row.top_pause_reason = hostReasons[0][0];
      row.top_pause_count = hostReasons[0][1];
    }

    return row;
  });

  rows.sort((a, b) => {
    if (b.total_runs !== a.total_runs) {
      return b.total_runs - a.total_runs;
    }
    return b.conversion_rate - a.conversion_rate;
  });

  return rows.slice(0, Math.max(limit, 1));
}
