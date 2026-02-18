import { notFound } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import SeekerDetailClient from "./SeekerDetailClient";

interface PageProps {
  params: { id: string };
}

export default async function SeekerDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = params;

  // Verify access
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", user.id)
    .eq("job_seeker_id", id)
    .maybeSingle();

  if (!assignment) {
    notFound();
  }

  // Load job seeker
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", id)
    .single();

  if (!seeker) {
    notFound();
  }

  // Load matched jobs with scores
  const { data: matchScores } = await supabaseAdmin
    .from("job_match_scores")
    .select(`
      id, score, reasons, created_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", id)
    .order("score", { ascending: false })
    .limit(100);

  // Load routing decisions
  const { data: routingDecisions } = await supabaseAdmin
    .from("job_routing_decisions")
    .select("job_post_id, decision, note")
    .eq("job_seeker_id", id);

  const decisionMap = new Map(
    (routingDecisions || []).map((d) => [d.job_post_id, d])
  );

  // Load application queue
  const { data: queueItems } = await supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", id)
    .order("created_at", { ascending: false });

  // Load application runs
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select(`
      id, status, current_step, last_error, created_at, updated_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", id)
    .order("updated_at", { ascending: false });

  // Load outreach contacts and drafts
  const { data: outreachDrafts } = await supabaseAdmin
    .from("outreach_drafts")
    .select(`
      id, subject, body, status, created_at, sent_at,
      job_posts (id, title, company),
      outreach_contacts (id, full_name, email, title, company_name)
    `)
    .eq("job_seeker_id", id)
    .order("created_at", { ascending: false });

  // Load recruiter threads
  const { data: recruiterThreads } = await supabaseAdmin
    .from("recruiter_threads")
    .select(`
      id, thread_status, last_reply_at, next_follow_up_at,
      recruiters (id, name, title, company, email)
    `)
    .eq("job_seeker_id", id)
    .order("last_reply_at", { ascending: false });

  // Load interviews
  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select(`
      id, scheduled_at, duration_min, interview_type, meeting_link,
      status, notes_for_candidate, notes_internal,
      job_posts (id, title, company)
    `)
    .eq("job_seeker_id", id)
    .order("scheduled_at", { ascending: false });

  // Load interview prep
  const { data: interviewPrep } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      id, content, created_at,
      job_posts (id, title, company)
    `)
    .eq("job_seeker_id", id);

  // Load references
  const { data: references } = await supabaseAdmin
    .from("job_seeker_references")
    .select("*")
    .eq("job_seeker_id", id);

  // Load documents
  const { data: documents } = await supabaseAdmin
    .from("job_seeker_documents")
    .select("*")
    .eq("job_seeker_id", id);

  // Load Gmail connection
  const { data: gmailConnection } = await supabaseAdmin
    .from("seeker_email_connections")
    .select("id, gmail_email, is_active, created_at")
    .eq("job_seeker_id", id)
    .eq("is_active", true)
    .maybeSingle();

  // Load inbound emails
  const { data: inboundEmails } = await supabaseAdmin
    .from("inbound_emails")
    .select(
      "id, from_email, from_name, subject, body_snippet, received_at, classification, classification_confidence, matched_application_id"
    )
    .eq("job_seeker_id", id)
    .order("received_at", { ascending: false })
    .limit(50);

  // Process matches with routing decisions
  const matchedJobs = (matchScores || []).map((m) => {
    const job = m.job_posts as unknown as { id: string; title: string; company: string; location: string; url: string } | null;
    const decision = job ? decisionMap.get(job.id) : null;
    return {
      ...m,
      job: job,
      routingDecision: decision?.decision || null,
      routingNote: decision?.note || null,
    };
  });

  return (
    <SeekerDetailClient
      seeker={seeker}
      matchedJobs={matchedJobs as unknown as Parameters<typeof SeekerDetailClient>[0]["matchedJobs"]}
      queueItems={(queueItems || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["queueItems"]}
      runs={(runs || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["runs"]}
      outreachDrafts={(outreachDrafts || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["outreachDrafts"]}
      recruiterThreads={(recruiterThreads || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["recruiterThreads"]}
      interviews={(interviews || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["interviews"]}
      interviewPrep={(interviewPrep || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["interviewPrep"]}
      references={(references || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["references"]}
      documents={(documents || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["documents"]}
      gmailConnection={gmailConnection ? { email: gmailConnection.gmail_email, connectedAt: gmailConnection.created_at } : null}
      inboundEmails={(inboundEmails || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["inboundEmails"]}
    />
  );
}
