export const OUTREACH_MESSAGE_STATES = [
  "DRAFTED",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "FOLLOWUP_DUE",
  "REPLIED",
  "BOUNCED",
  "FAILED",
  "OPTED_OUT",
  "CLOSED",
] as const;

export type OutreachMessageState = (typeof OUTREACH_MESSAGE_STATES)[number];

const OUTREACH_TRANSITIONS: Record<OutreachMessageState, OutreachMessageState[]> = {
  DRAFTED: ["QUEUED", "SENT", "CLOSED"],
  QUEUED: ["SENT", "FAILED", "CLOSED"],
  SENT: ["DELIVERED", "OPENED", "REPLIED", "FOLLOWUP_DUE", "BOUNCED", "FAILED", "CLOSED"],
  DELIVERED: ["OPENED", "REPLIED", "FOLLOWUP_DUE", "BOUNCED", "FAILED", "CLOSED"],
  OPENED: ["REPLIED", "FOLLOWUP_DUE", "BOUNCED", "FAILED", "CLOSED"],
  FOLLOWUP_DUE: ["QUEUED", "SENT", "CLOSED"],
  REPLIED: ["CLOSED"],
  BOUNCED: ["CLOSED"],
  FAILED: ["QUEUED", "CLOSED"],
  OPTED_OUT: ["CLOSED"],
  CLOSED: [],
};

export function normalizeOutreachState(value?: string | null): OutreachMessageState | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if ((OUTREACH_MESSAGE_STATES as readonly string[]).includes(normalized)) {
    return normalized as OutreachMessageState;
  }

  return null;
}

export function canTransitionOutreachState(
  current: string | null | undefined,
  next: OutreachMessageState
) {
  const currentState = normalizeOutreachState(current);
  if (!currentState) {
    return true;
  }

  if (currentState === next) {
    return true;
  }

  return OUTREACH_TRANSITIONS[currentState].includes(next);
}

export function deriveThreadStatusFromMessageStatus(
  messageStatus: string | null | undefined
): "ACTIVE" | "WAITING_REPLY" | "FOLLOW_UP_DUE" | "CLOSED" {
  const state = normalizeOutreachState(messageStatus);
  switch (state) {
    case "SENT":
    case "DELIVERED":
    case "OPENED":
      return "WAITING_REPLY";
    case "FOLLOWUP_DUE":
      return "FOLLOW_UP_DUE";
    case "REPLIED":
      return "ACTIVE";
    case "BOUNCED":
    case "FAILED":
    case "OPTED_OUT":
    case "CLOSED":
      return "CLOSED";
    default:
      return "ACTIVE";
  }
}
