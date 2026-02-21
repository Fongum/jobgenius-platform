import { supabaseServer } from "@/lib/supabase/server";

type BuildAutomationHintsArgs = {
  atsType: string | null;
  jobUrl: string | null;
};

type ErrorSignatureRow = {
  error_code: string | null;
  step: string | null;
};

type BlockerSummary = {
  error_code: string;
  count: number;
};

export type ApplyAutomationHints = {
  ats: string;
  url_host: string | null;
  max_auto_advance_steps: number;
  max_no_progress_rounds: number;
  button_hints: string[];
  blockers: BlockerSummary[];
  generated_at: string;
};

const BASE_BUTTON_HINTS: Record<string, string[]> = {
  LINKEDIN: ["next", "continue", "review", "submit application", "submit"],
  GREENHOUSE: ["next", "continue", "review", "submit application", "submit"],
  WORKDAY: [
    "next",
    "continue",
    "save and continue",
    "review",
    "submit application",
    "submit",
  ],
  GENERIC: [
    "next",
    "continue",
    "save and continue",
    "proceed",
    "review",
    "submit application",
    "submit",
    "apply",
  ],
  UNKNOWN: ["next", "continue", "review", "submit", "apply"],
};

function normalizeAtsType(atsType: string | null) {
  const value = (atsType ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

function getUrlHost(rawUrl: string | null) {
  if (!rawUrl) {
    return null;
  }
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function summarizeBlockers(rows: ErrorSignatureRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = (row.error_code ?? "UNKNOWN").trim().toUpperCase();
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const blockers = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([errorCode, count]) => ({ error_code: errorCode, count }));

  return { blockers, counts };
}

function deriveButtonHints(ats: string, counts: Map<string, number>) {
  const defaults = BASE_BUTTON_HINTS[ats] ?? BASE_BUTTON_HINTS.UNKNOWN;
  const hints = [...defaults];

  const submitMissingCount = counts.get("SUBMIT_BUTTON_MISSING") ?? 0;
  const reviewMissingCount = counts.get("REQUIRES_REVIEW") ?? 0;
  const noProgressCount = counts.get("NO_PROGRESS") ?? 0;

  if (submitMissingCount >= 2 || reviewMissingCount >= 2) {
    hints.push(
      "continue application",
      "save and continue",
      "next step",
      "proceed",
      "review and submit"
    );
  }

  if (noProgressCount >= 2) {
    hints.push("skip", "confirm", "continue to next step");
  }

  return uniqueTexts(hints);
}

function deriveMaxAdvance(counts: Map<string, number>) {
  const submitMissingCount = counts.get("SUBMIT_BUTTON_MISSING") ?? 0;
  const reviewMissingCount = counts.get("REQUIRES_REVIEW") ?? 0;
  const requiredFieldsCount = counts.get("REQUIRED_FIELDS") ?? 0;

  const frictionScore = submitMissingCount + reviewMissingCount + requiredFieldsCount;
  if (frictionScore >= 10) return 10;
  if (frictionScore >= 5) return 8;
  return 7;
}

function deriveNoProgressRounds(counts: Map<string, number>) {
  const noProgressCount = counts.get("NO_PROGRESS") ?? 0;
  return noProgressCount >= 3 ? 1 : 2;
}

async function loadSignatures(ats: string, urlHost: string | null) {
  const byHostQuery = supabaseServer
    .from("apply_error_signatures")
    .select("error_code, step")
    .eq("ats_type", ats)
    .order("created_at", { ascending: false })
    .limit(250);

  const scopedQuery = urlHost ? byHostQuery.eq("url_host", urlHost) : byHostQuery;
  const { data: hostRows, error: hostError } = await scopedQuery;

  if (!hostError && (hostRows?.length ?? 0) > 0) {
    return (hostRows ?? []) as ErrorSignatureRow[];
  }

  const { data: fallbackRows } = await supabaseServer
    .from("apply_error_signatures")
    .select("error_code, step")
    .eq("ats_type", ats)
    .order("created_at", { ascending: false })
    .limit(250);

  return (fallbackRows ?? []) as ErrorSignatureRow[];
}

export async function buildApplyAutomationHints(
  args: BuildAutomationHintsArgs
): Promise<ApplyAutomationHints> {
  const ats = normalizeAtsType(args.atsType);
  const urlHost = getUrlHost(args.jobUrl);
  const signatures = await loadSignatures(ats, urlHost);
  const { blockers, counts } = summarizeBlockers(signatures);

  return {
    ats,
    url_host: urlHost,
    max_auto_advance_steps: deriveMaxAdvance(counts),
    max_no_progress_rounds: deriveNoProgressRounds(counts),
    button_hints: deriveButtonHints(ats, counts),
    blockers: blockers.slice(0, 5),
    generated_at: new Date().toISOString(),
  };
}
