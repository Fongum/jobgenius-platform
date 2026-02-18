import { supabaseServer } from "@/lib/supabase/server";
import { GmailClient, parseFromHeader } from "./client";

type EmailClassification =
  | "rejection"
  | "interview_invite"
  | "offer"
  | "follow_up"
  | "verification"
  | "application_confirmation"
  | "other";

type ClassifiedEmail = {
  gmailMessageId: string;
  threadId: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  bodySnippet: string;
  bodyText: string;
  receivedAt: Date;
  classification: EmailClassification;
  confidence: number;
  extractedData: Record<string, unknown>;
};

/**
 * Classify an email based on subject and body content.
 * Uses keyword-based heuristics. A future version can use OpenAI for better accuracy.
 */
function classifyEmail(subject: string, body: string): {
  classification: EmailClassification;
  confidence: number;
  extractedData: Record<string, unknown>;
} {
  const text = `${subject} ${body}`.toLowerCase();

  // Rejection patterns
  const rejectionPatterns = [
    /we (have |will not be |are unable to |decided not to |won't be )?mov(e|ing) forward with other/,
    /unfortunately.{0,50}(not|won't|will not).{0,30}(proceed|moving|move forward|selected)/,
    /after careful (consideration|review).{0,50}(not|decided|unfortunately)/,
    /position has been filled/,
    /we.{0,20}regret to inform/,
    /not.{0,20}(selected|chosen|shortlisted)/,
    /thank you for.{0,30}interest.{0,50}(however|unfortunately|at this time)/,
  ];

  for (const pattern of rejectionPatterns) {
    if (pattern.test(text)) {
      return {
        classification: "rejection",
        confidence: 0.85,
        extractedData: {},
      };
    }
  }

  // Interview invite patterns
  const interviewPatterns = [
    /interview.{0,30}(schedule|invitation|invite|available|slot|time)/,
    /would.{0,20}like to.{0,20}(schedule|set up|arrange).{0,20}(interview|call|chat)/,
    /next (step|round|stage).{0,30}interview/,
    /phone (screen|interview|call)/,
    /technical (interview|assessment|screen)/,
    /onsite|on-site|virtual.{0,10}interview/,
  ];

  for (const pattern of interviewPatterns) {
    if (pattern.test(text)) {
      return {
        classification: "interview_invite",
        confidence: 0.8,
        extractedData: {},
      };
    }
  }

  // Offer patterns
  const offerPatterns = [
    /offer (letter|of employment|package)/,
    /pleased to (offer|extend)/,
    /congratulations.{0,40}(offer|position|role)/,
    /we('d| would) like to (offer|extend)/,
    /start date/,
    /compensation.{0,30}(package|details)/,
  ];

  for (const pattern of offerPatterns) {
    if (pattern.test(text)) {
      return {
        classification: "offer",
        confidence: 0.8,
        extractedData: {},
      };
    }
  }

  // Application confirmation
  const confirmPatterns = [
    /application.{0,30}(received|submitted|confirmed)/,
    /thank you for (applying|your application|submitting)/,
    /we.{0,20}received your (application|resume|cv)/,
    /successfully (applied|submitted)/,
  ];

  for (const pattern of confirmPatterns) {
    if (pattern.test(text)) {
      return {
        classification: "application_confirmation",
        confidence: 0.75,
        extractedData: {},
      };
    }
  }

  // Verification code
  const verifyPatterns = [
    /verif(y|ication) (your|code|email)/,
    /one.?time.?(code|password|pin)/,
    /\botp\b/,
    /confirm your email/,
  ];

  for (const pattern of verifyPatterns) {
    if (pattern.test(text)) {
      return {
        classification: "verification",
        confidence: 0.7,
        extractedData: {},
      };
    }
  }

  // Follow-up / status update
  const followUpPatterns = [
    /update.{0,20}(on|regarding|about).{0,20}(application|status|candidacy)/,
    /status.{0,20}(update|of|your)/,
    /check(ing)? in/,
    /following up/,
  ];

  for (const pattern of followUpPatterns) {
    if (pattern.test(text)) {
      return {
        classification: "follow_up",
        confidence: 0.6,
        extractedData: {},
      };
    }
  }

  return {
    classification: "other",
    confidence: 0.5,
    extractedData: {},
  };
}

/**
 * Scan a seeker's Gmail inbox for job-related emails and store classified results.
 */
export async function scanSeekerInbox(jobSeekerId: string): Promise<{
  scanned: number;
  newEmails: number;
  classifications: Record<string, number>;
}> {
  // Get the seeker's active Gmail connection
  const { data: connection } = await supabaseServer
    .from("seeker_email_connections")
    .select("id, email_address, last_sync_at")
    .eq("job_seeker_id", jobSeekerId)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .maybeSingle();

  if (!connection) {
    return { scanned: 0, newEmails: 0, classifications: {} };
  }

  const client = new GmailClient(connection.id);

  // Build query — only scan since last sync (or last 7 days)
  const sinceDate = connection.last_sync_at
    ? new Date(connection.last_sync_at)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const afterEpoch = Math.floor(sinceDate.getTime() / 1000);
  const query = `after:${afterEpoch} in:inbox`;

  const messages = await client.searchMessages(query, 50);

  let newEmails = 0;
  const classifications: Record<string, number> = {};

  for (const msg of messages) {
    // Check if we already have this email
    const { data: existing } = await supabaseServer
      .from("inbound_emails")
      .select("id")
      .eq("connection_id", connection.id)
      .eq("gmail_message_id", msg.id)
      .maybeSingle();

    if (existing) continue;

    const sender = parseFromHeader(msg.from);
    const result = classifyEmail(msg.subject, msg.body);

    // Try to match to an application
    let matchedApplicationId: string | null = null;
    let matchedJobPostId: string | null = null;

    if (
      result.classification !== "other" &&
      result.classification !== "verification"
    ) {
      // Try matching by sender company domain
      const senderDomain = sender.email.split("@")[1];
      if (senderDomain) {
        const { data: matchedApp } = await supabaseServer
          .from("application_queue")
          .select("id, job_post_id")
          .eq("job_seeker_id", jobSeekerId)
          .not("status", "eq", "DRAFT")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (matchedApp) {
          matchedApplicationId = matchedApp.id;
          matchedJobPostId = matchedApp.job_post_id;
        }
      }
    }

    const { error: insertError } = await supabaseServer
      .from("inbound_emails")
      .insert({
        job_seeker_id: jobSeekerId,
        connection_id: connection.id,
        gmail_message_id: msg.id,
        thread_id: msg.threadId,
        from_email: sender.email,
        from_name: sender.name,
        to_email: msg.to,
        subject: msg.subject,
        body_text: msg.body.slice(0, 10000),
        body_snippet: msg.snippet,
        received_at: msg.receivedAt.toISOString(),
        classification: result.classification,
        classification_confidence: result.confidence,
        matched_application_id: matchedApplicationId,
        matched_job_post_id: matchedJobPostId,
        extracted_data: result.extractedData,
        is_processed: true,
      });

    if (!insertError) {
      newEmails++;
      classifications[result.classification] =
        (classifications[result.classification] ?? 0) + 1;

      // Auto-update application status based on classification
      if (matchedApplicationId && result.confidence >= 0.75) {
        if (result.classification === "rejection") {
          await supabaseServer
            .from("application_queue")
            .update({
              status: "REJECTED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchedApplicationId)
            .in("status", ["APPLIED", "WAITING"]);
        } else if (result.classification === "interview_invite") {
          await supabaseServer
            .from("application_queue")
            .update({
              status: "INTERVIEW",
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchedApplicationId)
            .in("status", ["APPLIED", "WAITING"]);
        } else if (result.classification === "offer") {
          await supabaseServer
            .from("application_queue")
            .update({
              status: "OFFER",
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchedApplicationId)
            .in("status", ["APPLIED", "WAITING", "INTERVIEW"]);
        }
      }
    }
  }

  // Update last_sync_at
  await supabaseServer
    .from("seeker_email_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { scanned: messages.length, newEmails, classifications };
}

/**
 * Scan all active Gmail connections. Called by the background job runner.
 */
export async function scanAllInboxes(): Promise<{
  seekersScanned: number;
  totalNewEmails: number;
}> {
  const { data: connections } = await supabaseServer
    .from("seeker_email_connections")
    .select("job_seeker_id")
    .eq("provider", "gmail")
    .eq("is_active", true);

  if (!connections?.length) {
    return { seekersScanned: 0, totalNewEmails: 0 };
  }

  let totalNewEmails = 0;

  for (const conn of connections) {
    try {
      const result = await scanSeekerInbox(conn.job_seeker_id);
      totalNewEmails += result.newEmails;
    } catch (err) {
      console.error(
        `Inbox scan failed for seeker ${conn.job_seeker_id}:`,
        err
      );
      // Update connection with error but don't stop scanning others
      await supabaseServer
        .from("seeker_email_connections")
        .update({
          last_error:
            err instanceof Error ? err.message : "Inbox scan failed",
          updated_at: new Date().toISOString(),
        })
        .eq("job_seeker_id", conn.job_seeker_id)
        .eq("provider", "gmail");
    }
  }

  return { seekersScanned: connections.length, totalNewEmails };
}
