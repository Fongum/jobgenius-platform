import { resolveJobTargetUrl } from "@/lib/job-url";

export type ResolvedHostAutomationRule = {
  rule_id: string | null;
  url_host: string | null;
  apply_entry_hints: string[];
  submit_hints: string[];
  requires_apply_entry: boolean;
  prefer_popup_handoff: boolean;
};

type HostAutomationRule = {
  id: string;
  hosts: string[];
  applyEntryHints?: string[];
  submitHints?: string[];
  requiresApplyEntry?: boolean;
  preferPopupHandoff?: boolean;
};

const HOST_RULES: HostAutomationRule[] = [
  {
    id: "INDEED_LISTING",
    hosts: ["indeed.com"],
    applyEntryHints: [
      "apply now",
      "apply on company site",
      "apply on company website",
      "continue application",
      "continue applying",
      "continue to application",
      "view application",
      "visit employer site",
    ],
    submitHints: [
      "continue application",
      "continue to application",
      "review application",
      "submit application",
    ],
    requiresApplyEntry: true,
    preferPopupHandoff: true,
  },
  {
    id: "LEVER",
    hosts: ["lever.co"],
    applyEntryHints: ["apply for this job", "apply now", "apply"],
    submitHints: ["submit application", "submit", "apply", "next", "continue"],
    requiresApplyEntry: true,
  },
  {
    id: "SMARTRECRUITERS",
    hosts: ["smartrecruiters.com"],
    applyEntryHints: ["i'm interested", "apply now", "apply"],
    submitHints: ["next", "continue", "review", "submit application", "submit"],
    requiresApplyEntry: true,
  },
  {
    id: "ICIMS",
    hosts: ["icims.com"],
    applyEntryHints: [
      "apply now",
      "apply for this job online",
      "apply for this position",
      "continue to apply",
    ],
    submitHints: ["next", "continue", "submit application", "submit"],
    requiresApplyEntry: true,
  },
  {
    id: "JOBVITE",
    hosts: ["jobvite.com"],
    applyEntryHints: ["apply now", "apply", "start application"],
    submitHints: ["next", "continue", "review", "submit application", "submit"],
    requiresApplyEntry: true,
  },
  {
    id: "WORKABLE",
    hosts: ["workable.com"],
    applyEntryHints: ["apply for this job", "apply now", "apply"],
    submitHints: ["next", "continue", "submit application", "submit"],
    requiresApplyEntry: true,
  },
  {
    id: "BAMBOOHR",
    hosts: ["bamboohr.com"],
    applyEntryHints: ["apply for job", "apply now", "apply"],
    submitHints: ["next", "continue", "submit application", "submit"],
    requiresApplyEntry: true,
  },
];

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

function getUrlHost(rawUrl: string | null) {
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

function matchesHost(host: string, pattern: string) {
  return host === pattern || host.endsWith(`.${pattern}`);
}

export function resolveHostAutomationRule(
  jobUrl: string | null
): ResolvedHostAutomationRule {
  const urlHost = getUrlHost(jobUrl);
  if (!urlHost) {
    return {
      rule_id: null,
      url_host: null,
      apply_entry_hints: [],
      submit_hints: [],
      requires_apply_entry: false,
      prefer_popup_handoff: false,
    };
  }

  const rule =
    HOST_RULES.find((candidate) =>
      candidate.hosts.some((pattern) => matchesHost(urlHost, pattern))
    ) ?? null;

  return {
    rule_id: rule?.id ?? null,
    url_host: urlHost,
    apply_entry_hints: uniqueTexts(rule?.applyEntryHints ?? []),
    submit_hints: uniqueTexts(rule?.submitHints ?? []),
    requires_apply_entry: Boolean(rule?.requiresApplyEntry),
    prefer_popup_handoff: Boolean(rule?.preferPopupHandoff),
  };
}
