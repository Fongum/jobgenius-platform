export { applicationAckEmail } from "./application-ack";
export { shortlistNotificationEmail } from "./shortlist-notification";
export { interviewInviteEmail } from "./interview-invite";
export { interviewConfirmedEmail } from "./interview-confirmed";
export { interviewPrepReadyEmail } from "./interview-prep-ready";
export { rejectionFeedbackEmail } from "./rejection-feedback";
export { offerNotificationEmail } from "./offer-notification";

export const TEMPLATE_MAP = {
  application_ack: "application-ack",
  shortlist_notification: "shortlist-notification",
  interview_invite: "interview-invite",
  interview_confirmed: "interview-confirmed",
  interview_prep_ready: "interview-prep-ready",
  rejection_feedback: "rejection-feedback",
  offer_notification: "offer-notification",
} as const;

export type TemplateKey = keyof typeof TEMPLATE_MAP;
