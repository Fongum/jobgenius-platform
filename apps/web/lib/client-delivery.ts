export const CLIENT_DELIVERY_STAGES = [
  "onboarding",
  "ready_to_launch",
  "active_search",
  "interviewing",
  "offer",
  "placed",
  "paused",
] as const;

export const CLIENT_DELIVERY_RISK_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const CLIENT_DELIVERY_BLOCKER_TYPES = [
  "seeker_unresponsive",
  "billing_hold",
  "document_gap",
  "resume_gap",
  "availability_conflict",
  "interview_prep_gap",
  "recruiter_reply_pending",
  "background_check",
  "offer_decision",
  "internal_ops",
  "technical_issue",
] as const;

export const CLIENT_DELIVERY_BLOCKER_STATUSES = [
  "active",
  "resolved",
  "escalated",
] as const;

export const CLIENT_DELIVERY_ACTION_TYPES = [
  "application_push",
  "outreach_follow_up",
  "interview_prep",
  "client_check_in",
  "billing_follow_up",
  "document_request",
  "offer_support",
  "manager_escalation",
] as const;

export type ClientDeliveryStage = (typeof CLIENT_DELIVERY_STAGES)[number];
export type ClientDeliveryRiskLevel =
  (typeof CLIENT_DELIVERY_RISK_LEVELS)[number];
export type ClientDeliveryBlockerType =
  (typeof CLIENT_DELIVERY_BLOCKER_TYPES)[number];
export type ClientDeliveryBlockerStatus =
  (typeof CLIENT_DELIVERY_BLOCKER_STATUSES)[number];
export type ClientDeliveryActionType =
  (typeof CLIENT_DELIVERY_ACTION_TYPES)[number];

export interface ClientDeliveryCaseRecord {
  id: string;
  jobSeekerId: string;
  accountManagerId: string | null;
  stageOverride: ClientDeliveryStage | null;
  riskLevel: ClientDeliveryRiskLevel;
  paused: boolean;
  nextActionType: ClientDeliveryActionType | null;
  nextActionTitle: string;
  nextActionNotes: string;
  nextActionDueAt: string | null;
  nextActionCompletedAt: string | null;
  nextActionCompletedBy: string | null;
  managerNotes: string;
  lastManualReviewAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDeliveryBlockerRecord {
  id: string;
  caseId: string;
  blockerType: ClientDeliveryBlockerType;
  status: ClientDeliveryBlockerStatus;
  title: string;
  description: string;
  ownerAccountManagerId: string | null;
  dueAt: string | null;
  escalated: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDeliveryCaseBundle {
  snapshot: ClientDeliverySnapshotRecord | null;
  caseRecord: ClientDeliveryCaseRecord | null;
  blockers: ClientDeliveryBlockerRecord[];
}

export interface ClientDeliverySnapshotRecord {
  caseId: string | null;
  jobSeekerId: string;
  accountManagerId: string | null;
  fullName: string;
  email: string;
  location: string;
  seniority: string;
  targetTitles: string[];
  intakeStatus: string;
  workStarted: boolean;
  paymentStatus: string;
  amountPaid: number | null;
  totalAmount: number | null;
  paymentDeadline: string | null;
  systemStage: ClientDeliveryStage;
  effectiveStage: ClientDeliveryStage;
  stageOverride: ClientDeliveryStage | null;
  riskLevel: ClientDeliveryRiskLevel;
  paused: boolean;
  lastApplicationAt: string | null;
  applications7d: number;
  applications30d: number;
  openApplicationRuns: number;
  openQueueCount: number;
  lastOutreachAt: string | null;
  nextFollowUpAt: string | null;
  activeThreadCount: number;
  followUpsDueCount: number;
  nextInterviewAt: string | null;
  openInterviewCount: number;
  prepCount: number;
  lastOfferAt: string | null;
  hasOpenOffer: boolean;
  hasPlacedOffer: boolean;
  nextStartDate: string | null;
  hasPaymentHold: boolean;
  hasActiveEscalation: boolean;
  activeBlockerCount: number;
  activeBlockerTitles: string[];
  nextActionType: ClientDeliveryActionType | null;
  nextActionTitle: string;
  nextActionNotes: string;
  nextActionDueAt: string | null;
  nextActionCompletedAt: string | null;
  nextActionCompletedBy: string | null;
  managerNotes: string;
  lastManualReviewAt: string | null;
  overdueNextAction: boolean;
  lastTouchAt: string;
  daysSinceLastTouch: number;
  needsAttention: boolean;
  caseCreatedAt: string | null;
  caseUpdatedAt: string | null;
}

export interface ClientDeliveryBoardSummary {
  totalCount: number;
  needsAttentionCount: number;
  overdueNextActionCount: number;
  highRiskCount: number;
  activeBlockerCount: number;
  paymentHoldCount: number;
  stageCounts: Record<ClientDeliveryStage, number>;
  riskCounts: Record<ClientDeliveryRiskLevel, number>;
}

export function labelizeClientDeliveryValue(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const RISK_PRIORITY: Record<ClientDeliveryRiskLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function emptyStageCounts(): Record<ClientDeliveryStage, number> {
  return {
    onboarding: 0,
    ready_to_launch: 0,
    active_search: 0,
    interviewing: 0,
    offer: 0,
    placed: 0,
    paused: 0,
  };
}

function emptyRiskCounts(): Record<ClientDeliveryRiskLevel, number> {
  return {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
}

export function calculateDaysSinceTimestamp(
  timestamp: string | null | undefined,
  now = new Date()
): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  const diffMs = now.getTime() - parsed;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

export function isDeliveryNextActionOverdue(
  dueAt: string | null | undefined,
  completedAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!dueAt || completedAt) return false;
  const parsed = Date.parse(dueAt);
  if (Number.isNaN(parsed)) return false;
  return parsed < now.getTime();
}

export function deriveDeliveryNeedsAttention(args: {
  riskLevel: ClientDeliveryRiskLevel;
  activeBlockerCount: number;
  hasPaymentHold: boolean;
  hasActiveEscalation: boolean;
  nextActionDueAt?: string | null;
  nextActionCompletedAt?: string | null;
  nextFollowUpAt?: string | null;
  daysSinceLastTouch?: number | null;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  if (args.activeBlockerCount > 0) return true;
  if (args.hasPaymentHold || args.hasActiveEscalation) return true;
  if (args.riskLevel === "high" || args.riskLevel === "critical") return true;
  if (
    isDeliveryNextActionOverdue(
      args.nextActionDueAt ?? null,
      args.nextActionCompletedAt ?? null,
      now
    )
  ) {
    return true;
  }

  if (args.nextFollowUpAt) {
    const followUpAt = Date.parse(args.nextFollowUpAt);
    if (!Number.isNaN(followUpAt) && followUpAt <= now.getTime()) {
      return true;
    }
  }

  return (args.daysSinceLastTouch ?? 0) >= 5;
}

export function compareClientDeliverySnapshots(
  left: ClientDeliverySnapshotRecord,
  right: ClientDeliverySnapshotRecord
): number {
  if (left.needsAttention !== right.needsAttention) {
    return left.needsAttention ? -1 : 1;
  }

  if (left.overdueNextAction !== right.overdueNextAction) {
    return left.overdueNextAction ? -1 : 1;
  }

  const leftRisk = RISK_PRIORITY[left.riskLevel];
  const rightRisk = RISK_PRIORITY[right.riskLevel];
  if (leftRisk !== rightRisk) {
    return rightRisk - leftRisk;
  }

  if (left.activeBlockerCount !== right.activeBlockerCount) {
    return right.activeBlockerCount - left.activeBlockerCount;
  }

  if (left.daysSinceLastTouch !== right.daysSinceLastTouch) {
    return right.daysSinceLastTouch - left.daysSinceLastTouch;
  }

  if (left.nextActionDueAt && right.nextActionDueAt) {
    const diff = Date.parse(left.nextActionDueAt) - Date.parse(right.nextActionDueAt);
    if (diff !== 0) return diff;
  } else if (left.nextActionDueAt || right.nextActionDueAt) {
    return left.nextActionDueAt ? -1 : 1;
  }

  if (left.nextInterviewAt && right.nextInterviewAt) {
    const diff = Date.parse(left.nextInterviewAt) - Date.parse(right.nextInterviewAt);
    if (diff !== 0) return diff;
  } else if (left.nextInterviewAt || right.nextInterviewAt) {
    return left.nextInterviewAt ? -1 : 1;
  }

  return left.fullName.localeCompare(right.fullName);
}

export function buildClientDeliveryBoardSummary(
  rows: ClientDeliverySnapshotRecord[]
): ClientDeliveryBoardSummary {
  const summary: ClientDeliveryBoardSummary = {
    totalCount: rows.length,
    needsAttentionCount: 0,
    overdueNextActionCount: 0,
    highRiskCount: 0,
    activeBlockerCount: 0,
    paymentHoldCount: 0,
    stageCounts: emptyStageCounts(),
    riskCounts: emptyRiskCounts(),
  };

  for (const row of rows) {
    summary.stageCounts[row.effectiveStage] += 1;
    summary.riskCounts[row.riskLevel] += 1;
    if (row.needsAttention) summary.needsAttentionCount += 1;
    if (row.overdueNextAction) summary.overdueNextActionCount += 1;
    if (row.riskLevel === "high" || row.riskLevel === "critical") {
      summary.highRiskCount += 1;
    }
    if (row.activeBlockerCount > 0) summary.activeBlockerCount += 1;
    if (row.hasPaymentHold) summary.paymentHoldCount += 1;
  }

  return summary;
}
