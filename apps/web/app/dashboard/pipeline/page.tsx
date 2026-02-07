import { notFound } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import PipelineClient from "./PipelineClient";

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") return notFound();

  // Fetch assigned seekers
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);

  const seekerIds = (assignments || []).map((a) => a.job_seeker_id);

  if (seekerIds.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Job Hub</h1>
        <p className="text-gray-500">No job seekers assigned. Assign seekers to get started.</p>
      </div>
    );
  }

  // Fetch seeker profiles
  const { data: seekers } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, match_threshold, resume_text")
    .in("id", seekerIds);

  // Fetch match scores across all seekers
  const { data: matchScores } = await supabaseAdmin
    .from("job_match_scores")
    .select(`
      id, score, recommendation, reasons, created_at, job_seeker_id,
      job_posts (id, title, company, location, url, salary_min, salary_max, required_skills, preferred_skills, description_text)
    `)
    .in("job_seeker_id", seekerIds)
    .order("score", { ascending: false })
    .limit(500);

  // Fetch routing decisions
  const { data: routingDecisions } = await supabaseAdmin
    .from("job_routing_decisions")
    .select("job_post_id, job_seeker_id, decision, note")
    .in("job_seeker_id", seekerIds);

  // Fetch queue items
  const { data: queueItems } = await supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at, last_error, job_seeker_id, job_post_id,
      job_posts (id, title, company, location, url, salary_min, salary_max, required_skills, preferred_skills, description_text),
      job_seekers (id, full_name)
    `)
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: false });

  // Fetch application runs
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select(`
      id, status, current_step, last_error, ats_type, needs_attention_reason, created_at, updated_at, job_seeker_id, job_post_id, queue_id,
      job_posts (id, title, company, location, url),
      job_seekers (id, full_name)
    `)
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: false });

  // Fetch outreach contacts
  const { data: outreachContacts } = await supabaseAdmin
    .from("outreach_contacts")
    .select("id, role, full_name, email, job_post_id, job_seeker_id")
    .in("job_seeker_id", seekerIds);

  // Fetch outreach drafts
  const { data: outreachDrafts } = await supabaseAdmin
    .from("outreach_drafts")
    .select(`
      id, subject, body, status, created_at, sent_at, job_seeker_id,
      job_posts (id, title, company),
      outreach_contacts (id, full_name, email, role)
    `)
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: false });

  // Fetch tailored resumes
  const { data: tailoredResumes } = await supabaseAdmin
    .from("tailored_resumes")
    .select("id, job_seeker_id, job_post_id, tailored_text, changes_summary")
    .in("job_seeker_id", seekerIds);

  return (
    <PipelineClient
      seekers={(seekers || []) as Parameters<typeof PipelineClient>[0]["seekers"]}
      matchScores={(matchScores || []) as unknown as Parameters<typeof PipelineClient>[0]["matchScores"]}
      routingDecisions={(routingDecisions || []) as Parameters<typeof PipelineClient>[0]["routingDecisions"]}
      queueItems={(queueItems || []) as unknown as Parameters<typeof PipelineClient>[0]["queueItems"]}
      runs={(runs || []) as unknown as Parameters<typeof PipelineClient>[0]["runs"]}
      outreachContacts={(outreachContacts || []) as Parameters<typeof PipelineClient>[0]["outreachContacts"]}
      outreachDrafts={(outreachDrafts || []) as unknown as Parameters<typeof PipelineClient>[0]["outreachDrafts"]}
      tailoredResumes={(tailoredResumes || []) as Parameters<typeof PipelineClient>[0]["tailoredResumes"]}
    />
  );
}
