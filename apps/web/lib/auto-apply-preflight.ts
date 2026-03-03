import { detectAtsType, getInitialStep } from "@/lib/apply";
import { resolveHostAutomationRule } from "@/lib/apply-host-rules";
import { resolveJobTargetUrl } from "@/lib/job-url";
import { buildMatchExplanation } from "@/lib/matching/explanations";
import { supabaseServer } from "@/lib/supabase/server";

type StoredCookie = {
  domain?: string;
};

type StoredOrigin = {
  origin?: string;
};

type StoredStorageState = {
  cookies?: StoredCookie[];
  origins?: StoredOrigin[];
};

type MatchScoreInput = {
  score?: number | null;
  confidence?: string | null;
  recommendation?: string | null;
  reasons?: Record<string, unknown> | null;
};

type AutoApplyPreflightInput = {
  source?: string | null;
  url?: string | null;
  matchScore?: MatchScoreInput | null;
  storageState?: StoredStorageState | null;
  allowedAts: Set<string>;
};

export type AutoApplyPreflightDecision = {
  eligible: boolean;
  atsType: string;
  initialStep: string | null;
  targetUrl: string | null;
  targetHost: string | null;
  hostRuleId: string | null;
  reasonCode: string | null;
  message: string | null;
};

const RUNNER_STATE_BUCKET = "runner_state";

function parseHostname(rawUrl: string | null) {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesHost(host: string, domainOrHost: string) {
  const normalized = domainOrHost.replace(/^\./, "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return host === normalized || host.endsWith(`.${normalized}`);
}

export function storageStateHasHostAccess(
  storageState: StoredStorageState | null | undefined,
  targetHost: string | null
) {
  if (!storageState || !targetHost) {
    return false;
  }

  for (const cookie of storageState.cookies ?? []) {
    if (typeof cookie?.domain === "string" && matchesHost(targetHost, cookie.domain)) {
      return true;
    }
  }

  for (const origin of storageState.origins ?? []) {
    if (typeof origin?.origin !== "string") {
      continue;
    }

    try {
      const host = new URL(origin.origin).hostname.toLowerCase();
      if (matchesHost(targetHost, host)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export async function loadSavedRunnerStorageState(jobSeekerId: string) {
  const storagePath = `${jobSeekerId}/storage-state.json`;
  const { data, error } = await supabaseServer.storage
    .from(RUNNER_STATE_BUCKET)
    .download(storagePath);

  if (error || !data) {
    return null;
  }

  try {
    const parsed = JSON.parse(await data.text()) as StoredStorageState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function ineligible(
  input: Omit<AutoApplyPreflightDecision, "eligible">
): AutoApplyPreflightDecision {
  return { eligible: false, ...input };
}

export function evaluateAutoApplyPreflight(
  input: AutoApplyPreflightInput
): AutoApplyPreflightDecision {
  const targetUrl = resolveJobTargetUrl(input.url ?? "") || input.url || null;
  const targetHost = parseHostname(targetUrl);

  if (!targetHost || !targetUrl) {
    return ineligible({
      atsType: "GENERIC",
      initialStep: null,
      targetUrl,
      targetHost: null,
      hostRuleId: null,
      reasonCode: "JOB_URL_INVALID",
      message: "Job link is missing or invalid for autonomous apply.",
    });
  }

  const atsType = detectAtsType(input.source ?? null, targetUrl);
  const hostRule = resolveHostAutomationRule(targetUrl);
  const explanation = buildMatchExplanation(input.matchScore?.reasons, {
    score: input.matchScore?.score ?? null,
    confidence: input.matchScore?.confidence ?? null,
    recommendation: input.matchScore?.recommendation ?? null,
  });

  if (!input.allowedAts.has(atsType)) {
    return ineligible({
      atsType,
      initialStep: null,
      targetUrl,
      targetHost,
      hostRuleId: hostRule.rule_id,
      reasonCode: "ATS_UNSUPPORTED",
      message: `ATS not allowed for autonomous apply: ${atsType}`,
    });
  }

  if (explanation.queueBlocked) {
    return ineligible({
      atsType,
      initialStep: null,
      targetUrl,
      targetHost,
      hostRuleId: hostRule.rule_id,
      reasonCode: "MATCH_BLOCKED",
      message:
        explanation.queueBlockReason || "Match is blocked from autonomous apply.",
    });
  }

  if (atsType === "GENERIC" && !hostRule.rule_id) {
    return ineligible({
      atsType,
      initialStep: null,
      targetUrl,
      targetHost,
      hostRuleId: null,
      reasonCode: "HOST_UNSUPPORTED",
      message: `No trusted host automation rule exists for ${targetHost}.`,
    });
  }

  if (hostRule.prefer_popup_handoff) {
    return ineligible({
      atsType,
      initialStep: null,
      targetUrl,
      targetHost,
      hostRuleId: hostRule.rule_id,
      reasonCode: "EXTENSION_REQUIRED",
      message:
        "This host is marked extension-first. Launch it from the browser extension instead of background auto-run.",
    });
  }

  if (
    atsType === "LINKEDIN" &&
    !storageStateHasHostAccess(input.storageState, targetHost)
  ) {
    return ineligible({
      atsType,
      initialStep: null,
      targetUrl,
      targetHost,
      hostRuleId: hostRule.rule_id,
      reasonCode: "AUTH_SESSION_MISSING",
      message:
        "No saved browser session was found for LinkedIn. Open LinkedIn in the extension before auto-running this job.",
    });
  }

  return {
    eligible: true,
    atsType,
    initialStep: getInitialStep(atsType),
    targetUrl,
    targetHost,
    hostRuleId: hostRule.rule_id,
    reasonCode: null,
    message: null,
  };
}
