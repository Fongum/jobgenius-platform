/**
 * Outreach Reply Classifier + AI Draft Generator
 *
 * Classifies incoming recruiter replies and generates draft responses.
 */

import { supabaseServer } from "@/lib/supabase/server";

export type ReplyClassification =
  | "positive_interest"
  | "scheduling"
  | "follow_up"
  | "rejection"
  | "info_request"
  | "out_of_office"
  | "other";

const CLASSIFICATION_PATTERNS: { classification: ReplyClassification; patterns: RegExp[] }[] = [
  {
    classification: "scheduling",
    patterns: [
      /schedule|calendar|availab|time slot|set up a (call|meeting|chat)|when (are you|can you)|let('s| us) (find|set|pick)/i,
      /interview.*time|phone screen|zoom link|teams link|google meet/i,
    ],
  },
  {
    classification: "positive_interest",
    patterns: [
      /impressed|great (fit|match|candidate)|love to (chat|talk|meet|discuss)|move forward|next step/i,
      /excited to|perfect for|strong (candidate|background|profile)|would like to (connect|discuss)/i,
    ],
  },
  {
    classification: "rejection",
    patterns: [
      /unfortunately|not (a fit|moving|proceeding)|decided to (go|move) (with|forward with) (another|other)/i,
      /position (has been|was) filled|not the right (fit|match)|wish you (the best|luck)/i,
      /will not be (moving|proceeding)|regret to inform/i,
    ],
  },
  {
    classification: "info_request",
    patterns: [
      /could you (send|share|provide)|do you have|can you (send|share|attach)/i,
      /your (resume|cv|portfolio|salary|expectation)|more (info|information|details) about/i,
    ],
  },
  {
    classification: "out_of_office",
    patterns: [
      /out of (office|the office)|on (vacation|leave|holiday|pto)|will (be back|return) on/i,
      /auto.?reply|automatic reply|limited (access|availability)/i,
    ],
  },
  {
    classification: "follow_up",
    patterns: [
      /follow.?up|checking in|touch base|circling back|any update/i,
      /haven't heard|wanted to (check|see|follow)|still interested/i,
    ],
  },
];

/**
 * Classify a reply message using pattern matching
 */
export function classifyReply(subject: string, body: string): ReplyClassification {
  const text = `${subject} ${body}`;

  for (const { classification, patterns } of CLASSIFICATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return classification;
    }
  }

  return "other";
}

/**
 * Generate an AI draft reply based on classification
 */
export function generateDraftReply(input: {
  classification: ReplyClassification;
  seekerName: string;
  company: string;
  recruiterName: string;
  roleTitle?: string;
}): string | null {
  const { classification, seekerName, company, recruiterName, roleTitle } = input;
  const role = roleTitle ? ` ${roleTitle} role` : " opportunity";

  switch (classification) {
    case "positive_interest":
      return `Hi ${recruiterName},\n\nThank you for your interest in ${seekerName}'s profile! We're excited about the${role} at ${company}.\n\n${seekerName} is available for an initial conversation at your convenience. Would any time this week work for a brief call?\n\nBest regards`;

    case "scheduling":
      return `Hi ${recruiterName},\n\nThank you for reaching out about scheduling. ${seekerName} is available during the following times:\n\n- [Time slot 1]\n- [Time slot 2]\n- [Time slot 3]\n\nPlease let us know what works best, and we'll confirm right away.\n\nBest regards`;

    case "info_request":
      return `Hi ${recruiterName},\n\nThank you for your interest. I've attached the requested information for ${seekerName}'s application to the${role} at ${company}.\n\nPlease let us know if you need anything else.\n\nBest regards`;

    case "rejection":
      return `Hi ${recruiterName},\n\nThank you for letting us know. We appreciate the consideration for the${role} at ${company}.\n\nIf any similar positions open up in the future, we'd love to be considered. ${seekerName} remains very interested in ${company}.\n\nBest regards`;

    case "follow_up":
      return `Hi ${recruiterName},\n\nThank you for following up. ${seekerName} is still very interested in the${role} at ${company} and remains available for next steps.\n\nPlease let us know how we can move forward.\n\nBest regards`;

    case "out_of_office":
      return null; // Don't reply to OOO

    default:
      return null;
  }
}

/**
 * Process a new outreach reply: classify + generate draft
 */
export async function processOutreachReply(messageId: string) {
  const { data: msg } = await supabaseServer
    .from("outreach_messages")
    .select(`
      id, subject, body, direction,
      outreach_threads (
        id, job_seeker_id,
        outreach_recruiters (id, name, company),
        job_posts (id, title, company)
      )
    `)
    .eq("id", messageId)
    .single();

  if (!msg || msg.direction !== "inbound") return null;

  const thread = msg.outreach_threads as unknown as {
    id: string;
    job_seeker_id: string;
    outreach_recruiters: { id: string; name: string; company: string } | null;
    job_posts: { id: string; title: string; company: string } | null;
  };

  const classification = classifyReply(msg.subject ?? "", msg.body ?? "");

  // Get seeker name
  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("full_name")
    .eq("id", thread.job_seeker_id)
    .single();

  const draftReply = generateDraftReply({
    classification,
    seekerName: seeker?.full_name ?? "the candidate",
    company: thread.outreach_recruiters?.company ?? thread.job_posts?.company ?? "the company",
    recruiterName: thread.outreach_recruiters?.name ?? "there",
    roleTitle: thread.job_posts?.title,
  });

  // Update message with classification and draft
  await supabaseServer
    .from("outreach_messages")
    .update({
      reply_classification: classification,
      ai_draft_reply: draftReply,
      ai_draft_status: draftReply ? "generated" : "none",
    })
    .eq("id", messageId);

  return { classification, draftReply };
}
