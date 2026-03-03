import type { MatchConfidence, MatchRecommendation } from "./types";

type UnknownRecord = Record<string, unknown>;

type ExplanationOptions = {
  score?: number | null;
  confidence?: MatchConfidence | string | null;
  recommendation?: MatchRecommendation | string | null;
};

export type MatchExplanation = {
  highlights: string[];
  blockers: string[];
  cautions: string[];
  queueBlocked: boolean;
  queueBlockCode: string | null;
  queueBlockReason: string | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pushUnique(target: string[], value: string | null) {
  if (!value) {
    return;
  }
  if (!target.includes(value)) {
    target.push(value);
  }
}

function summarizeList(values: string[], count = 3): string {
  return values.slice(0, count).join(", ");
}

function getComponentDetails(reasons: unknown, key: string): UnknownRecord | null {
  const root = asRecord(reasons);
  const componentScores = asRecord(root?.component_scores);
  const component = asRecord(componentScores?.[key]);
  return asRecord(component?.details);
}

function getPenaltyReasons(reasons: unknown): string[] {
  const details = getComponentDetails(reasons, "penalties");
  return asStringArray(details?.reasons);
}

function toFriendlyBlocker(reasonCode: string): string {
  if (reasonCode.startsWith("exclude_keyword:")) {
    const keyword = reasonCode.split(":")[1]?.trim();
    return keyword
      ? `Blocked by excluded keyword: ${keyword}`
      : "Blocked by an excluded keyword";
  }

  switch (reasonCode) {
    case "visa_sponsorship_not_offered":
      return "Requires visa sponsorship but this job does not offer it";
    case "title_mismatch":
      return "Job title does not match the seeker's target role family";
    case "weak_title_alignment":
      return "Job title is weakly aligned to the seeker's target roles";
    default:
      return reasonCode.replace(/_/g, " ");
  }
}

function deriveQueueBlock(reasonCodes: string[], options: ExplanationOptions) {
  const normalizedCodes = reasonCodes.filter(Boolean);
  const hardBlockCode =
    normalizedCodes.find((code) => code.startsWith("exclude_keyword:")) ??
    normalizedCodes.find((code) =>
      ["visa_sponsorship_not_offered", "title_mismatch"].includes(code)
    ) ??
    null;

  if (hardBlockCode) {
    return {
      queueBlocked: true,
      queueBlockCode: hardBlockCode,
      queueBlockReason: toFriendlyBlocker(hardBlockCode),
    };
  }

  const recommendation = String(options.recommendation || "").toLowerCase();
  const score = asNumber(options.score);
  if (
    recommendation === "poor_fit" &&
    score !== null &&
    score < 40
  ) {
    return {
      queueBlocked: true,
      queueBlockCode: "poor_fit",
      queueBlockReason: "Score is too low to queue automatically",
    };
  }

  return {
    queueBlocked: false,
    queueBlockCode: null,
    queueBlockReason: null,
  };
}

export function buildMatchExplanation(
  reasons: unknown,
  options: ExplanationOptions = {}
): MatchExplanation {
  const highlights: string[] = [];
  const blockers: string[] = [];
  const cautions: string[] = [];

  const skills = getComponentDetails(reasons, "skills");
  const title = getComponentDetails(reasons, "title");
  const location = getComponentDetails(reasons, "location");
  const experience = getComponentDetails(reasons, "experience");
  const salary = getComponentDetails(reasons, "salary");

  const matchedTitles = asStringArray(title?.matched_titles);
  const partialTitles = asStringArray(title?.partial_matches);
  if (matchedTitles.length > 0) {
    pushUnique(
      highlights,
      `Title aligns with target role: ${summarizeList(matchedTitles, 2)}`
    );
  } else if (partialTitles.length > 0) {
    pushUnique(
      highlights,
      `Partial title alignment: ${summarizeList(partialTitles, 2)}`
    );
  }

  const matchedRequired = asStringArray(skills?.matched_required);
  const matchedPreferred = asStringArray(skills?.matched_preferred);
  const missingRequired = asStringArray(skills?.missing_required);
  const coveragePct = asNumber(skills?.coverage_pct);
  if (matchedRequired.length > 0) {
    pushUnique(
      highlights,
      `Matches ${matchedRequired.length} required skill${matchedRequired.length === 1 ? "" : "s"}`
    );
  } else if (matchedPreferred.length > 0) {
    pushUnique(
      highlights,
      `Matches ${matchedPreferred.length} preferred skill${matchedPreferred.length === 1 ? "" : "s"}`
    );
  }
  if (missingRequired.length > 0) {
    pushUnique(
      cautions,
      `Missing required skills: ${summarizeList(missingRequired, 3)}${missingRequired.length > 3 ? "..." : ""}`
    );
  } else if (coveragePct !== null && coveragePct >= 70) {
    pushUnique(highlights, `Required skill coverage is ${coveragePct}%`);
  }

  const locationMatchType = String(location?.match_type || "").toLowerCase();
  if (locationMatchType === "remote") {
    pushUnique(highlights, "Location fit is strong because the role is remote-compatible");
  } else if (locationMatchType === "exact") {
    pushUnique(highlights, "Location matches the seeker's target area");
  } else if (locationMatchType === "relocation") {
    pushUnique(highlights, "Location works because the seeker is open to relocation");
  } else if (locationMatchType === "mismatch") {
    pushUnique(cautions, "Location does not align cleanly with the seeker's preference");
  }

  const experienceMatchType = String(experience?.match_type || "").toLowerCase();
  if (experienceMatchType === "exact") {
    pushUnique(highlights, "Experience level is on target");
  } else if (experienceMatchType === "close") {
    pushUnique(highlights, "Experience is close to the stated minimum");
  } else if (experienceMatchType === "under") {
    pushUnique(cautions, "Experience appears below the stated minimum");
  }

  const salaryMatchType = String(salary?.match_type || "").toLowerCase();
  if (salaryMatchType === "full") {
    pushUnique(highlights, "Salary range fully overlaps the seeker's target");
  } else if (salaryMatchType === "partial") {
    pushUnique(highlights, "Salary range partially overlaps the seeker's target");
  } else if (salaryMatchType === "none") {
    pushUnique(cautions, "Salary range does not overlap the seeker's target");
  }

  const penaltyReasons = getPenaltyReasons(reasons);
  for (const reasonCode of penaltyReasons) {
    if (reasonCode === "weak_title_alignment") {
      pushUnique(cautions, toFriendlyBlocker(reasonCode));
      continue;
    }
    pushUnique(blockers, toFriendlyBlocker(reasonCode));
  }

  const queueBlock = deriveQueueBlock(penaltyReasons, options);

  if (highlights.length === 0) {
    const recommendation = String(options.recommendation || "").toLowerCase();
    const score = asNumber(options.score);
    if (recommendation === "strong_match") {
      pushUnique(highlights, "Overall score indicates a strong fit");
    } else if (recommendation === "good_match") {
      pushUnique(highlights, "Overall score indicates a solid fit");
    } else if (score !== null) {
      pushUnique(highlights, `Overall score: ${Math.round(score)}%`);
    }
  }

  const confidence = String(options.confidence || "").toLowerCase();
  if (confidence === "low") {
    pushUnique(cautions, "Match confidence is low because profile or job data is sparse");
  }

  return {
    highlights: highlights.slice(0, 4),
    blockers: blockers.slice(0, 3),
    cautions: cautions.slice(0, 3),
    queueBlocked: queueBlock.queueBlocked,
    queueBlockCode: queueBlock.queueBlockCode,
    queueBlockReason: queueBlock.queueBlockReason,
  };
}
