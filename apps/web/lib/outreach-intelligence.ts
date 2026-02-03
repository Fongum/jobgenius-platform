type RecruiterType = "RECRUITER" | "HIRING_MANAGER" | "LEADERSHIP" | "UNKNOWN";
type OutreachTone = "CONCISE" | "WARM" | "VALUE";

const POSITIVE_WORDS = [
  "great",
  "thanks",
  "interesting",
  "interested",
  "good",
  "love",
  "yes",
  "happy",
  "awesome",
  "schedule",
  "interview",
  "proceed",
];

const NEGATIVE_WORDS = [
  "no",
  "not",
  "decline",
  "unfortunately",
  "reject",
  "later",
  "stop",
  "unsubscribe",
  "spam",
  "busy",
  "never",
  "cannot",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function inferRecruiterType(title?: string | null): RecruiterType {
  const normalized = (title ?? "").toLowerCase();

  if (!normalized) {
    return "UNKNOWN";
  }

  if (
    normalized.includes("vp") ||
    normalized.includes("chief") ||
    normalized.includes("director") ||
    normalized.includes("head")
  ) {
    return "LEADERSHIP";
  }

  if (
    normalized.includes("talent") ||
    normalized.includes("recruit") ||
    normalized.includes("sourc")
  ) {
    return "RECRUITER";
  }

  if (
    normalized.includes("hiring manager") ||
    normalized.includes("engineering manager") ||
    normalized.includes("manager")
  ) {
    return "HIRING_MANAGER";
  }

  return "UNKNOWN";
}

export function inferPreferredTone({
  recruiterType,
  wasOpened,
  stepNumber,
}: {
  recruiterType: RecruiterType;
  wasOpened: boolean;
  stepNumber: number;
}): OutreachTone {
  if (wasOpened && stepNumber >= 2) {
    return "VALUE";
  }

  if (recruiterType === "LEADERSHIP") {
    return "CONCISE";
  }

  if (recruiterType === "RECRUITER" || recruiterType === "HIRING_MANAGER") {
    return "WARM";
  }

  return "CONCISE";
}

export function scoreReplySentiment(text?: string | null) {
  if (!text) {
    return 0;
  }

  const words = tokenize(text);
  if (words.length === 0) {
    return 0;
  }

  let positive = 0;
  let negative = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.includes(word)) {
      positive += 1;
    }
    if (NEGATIVE_WORDS.includes(word)) {
      negative += 1;
    }
  }

  const raw = ((positive - negative) / Math.max(words.length, 1)) * 100;
  return Math.round(clamp(raw, -100, 100));
}

export function sentimentLabel(score: number): "POSITIVE" | "NEUTRAL" | "NEGATIVE" {
  if (score >= 20) {
    return "POSITIVE";
  }
  if (score <= -20) {
    return "NEGATIVE";
  }
  return "NEUTRAL";
}

export function computeGhostingRisk({
  hoursSinceLastOutbound,
  wasOpened,
  hasReply,
  hasBounce,
  followUpCount,
}: {
  hoursSinceLastOutbound: number;
  wasOpened: boolean;
  hasReply: boolean;
  hasBounce: boolean;
  followUpCount: number;
}) {
  if (hasReply) {
    return 0;
  }

  let score = 20;
  score += clamp(hoursSinceLastOutbound * 0.8, 0, 55);
  score += clamp(followUpCount * 8, 0, 20);

  if (wasOpened) {
    score -= 15;
  }
  if (hasBounce) {
    score += 40;
  }

  return Math.round(clamp(score, 0, 100));
}

export function buildCompanySignal({
  companyName,
  openRoleCount,
  recentRoleTitle,
}: {
  companyName?: string | null;
  openRoleCount?: number;
  recentRoleTitle?: string | null;
}) {
  const safeCompany = companyName?.trim() || "your team";
  const count = Math.max(openRoleCount ?? 0, 0);

  if (count >= 3 && recentRoleTitle) {
    return `${safeCompany} is actively hiring (${count} open roles, including ${recentRoleTitle}).`;
  }

  if (count >= 2) {
    return `${safeCompany} appears to be in a hiring cycle (${count} open roles).`;
  }

  if (count === 1 && recentRoleTitle) {
    return `${safeCompany} recently opened a role: ${recentRoleTitle}.`;
  }

  return `${safeCompany} has active hiring momentum.`;
}

export function buildAdaptiveFollowUpCopy({
  recruiterName,
  companyName,
  jobSeekerName,
  previousSubject,
  stepNumber,
  tone,
  companySignal,
}: {
  recruiterName?: string | null;
  companyName?: string | null;
  jobSeekerName?: string | null;
  previousSubject?: string | null;
  stepNumber: number;
  tone: OutreachTone;
  companySignal: string;
}) {
  const greetingName = recruiterName?.trim() || "there";
  const safeCompany = companyName?.trim() || "your team";
  const safeCandidate = jobSeekerName?.trim() || "our candidate";
  const subjectPrefix = previousSubject?.trim() ? `Re: ${previousSubject.trim()}` : `Following up on ${safeCandidate}`;

  const subject =
    stepNumber <= 2 ? subjectPrefix : `${subjectPrefix} (quick follow-up)`;

  if (tone === "VALUE") {
    return {
      subject,
      body: [
        `Hi ${greetingName},`,
        "",
        `Quick follow-up on ${safeCandidate}.`,
        companySignal,
        "If helpful, I can send a focused 3-bullet summary tied to your open role needs.",
        "",
        "Thanks,",
        "JobGenius AM",
      ].join("\n"),
    };
  }

  if (tone === "WARM") {
    return {
      subject,
      body: [
        `Hi ${greetingName},`,
        "",
        `Wanted to bump this in case it got buried. ${safeCandidate} is still excited about opportunities at ${safeCompany}.`,
        companySignal,
        "Happy to coordinate a short intro whenever useful.",
        "",
        "Best,",
        "JobGenius AM",
      ].join("\n"),
    };
  }

  return {
    subject,
    body: [
      `Hi ${greetingName},`,
      "",
      `Following up on ${safeCandidate} for roles at ${safeCompany}.`,
      companySignal,
      "If this is not the right contact, I would appreciate a quick redirect.",
      "",
      "Thanks,",
      "JobGenius AM",
    ].join("\n"),
  };
}

export function buildOutreachPlan({
  recruiterTitle,
  wasOpened,
  hasReply,
  hasBounce,
  stepNumber,
  hoursSinceLastOutbound,
  followUpCount,
  companyName,
  openRoleCount,
  recentRoleTitle,
}: {
  recruiterTitle?: string | null;
  wasOpened: boolean;
  hasReply: boolean;
  hasBounce: boolean;
  stepNumber: number;
  hoursSinceLastOutbound: number;
  followUpCount: number;
  companyName?: string | null;
  openRoleCount?: number;
  recentRoleTitle?: string | null;
}) {
  const recruiterType = inferRecruiterType(recruiterTitle);
  const preferredTone = inferPreferredTone({
    recruiterType,
    wasOpened,
    stepNumber,
  });

  const ghostingRiskScore = computeGhostingRisk({
    hoursSinceLastOutbound,
    wasOpened,
    hasReply,
    hasBounce,
    followUpCount,
  });

  const companySignal = buildCompanySignal({
    companyName,
    openRoleCount,
    recentRoleTitle,
  });

  const nextAction = hasReply
    ? "AM_HANDOFF"
    : ghostingRiskScore >= 75
      ? "FOLLOW_UP_DUE"
      : "WAIT_FOR_REPLY";

  return {
    recruiterType,
    preferredTone,
    ghostingRiskScore,
    companySignal,
    nextAction,
    planVersion: "v1",
  };
}
