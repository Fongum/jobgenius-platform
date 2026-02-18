import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import SeekersClient from "./SeekersClient";

interface SeekerData {
  id: string;
  full_name: string | null;
  email: string;
  location: string | null;
  seniority: string | null;
  work_type: string | null;
  target_titles: string[] | null;
  skills: string[] | null;
  profile_completion: number | null;
  match_threshold: number | null;
  status: string | null;
}

interface SeekerStats {
  matched: number;
  queued: number;
  applied: number;
  needsAttention: number;
  interviews: number;
  gmailConnected: boolean;
  gmailEmail: string | null;
  inboxTotal: number;
  inboxInterviews: number;
}

export default async function SeekersPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Get assigned job seekers
  const { data: assignments, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select(`
      job_seeker_id,
      job_seekers (
        id, full_name, email, location, seniority, work_type,
        target_titles, skills, profile_completion, match_threshold, status
      )
    `)
    .eq("account_manager_id", user.id);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load job seekers.</p>
      </div>
    );
  }

  // Flatten seekers
  const seekers = (assignments || [])
    .flatMap((a) => {
      const s = a.job_seekers;
      if (!s) return [];
      return Array.isArray(s) ? s : [s];
    }) as SeekerData[];

  if (seekers.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Job Seekers</h1>
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No job seekers assigned yet.</p>
        </div>
      </div>
    );
  }

  const seekerIds = seekers.map((s) => s.id);

  // Get stats for each seeker
  const [matchesData, queueData, runsData, interviewsData, gmailData, inboxData] = await Promise.all([
    supabaseAdmin
      .from("job_match_scores")
      .select("job_seeker_id, score")
      .in("job_seeker_id", seekerIds),
    supabaseAdmin
      .from("application_queue")
      .select("job_seeker_id, status")
      .in("job_seeker_id", seekerIds),
    supabaseAdmin
      .from("application_runs")
      .select("job_seeker_id, status")
      .in("job_seeker_id", seekerIds),
    supabaseAdmin
      .from("interviews")
      .select("job_seeker_id, status, scheduled_at")
      .in("job_seeker_id", seekerIds)
      .gte("scheduled_at", new Date().toISOString()),
    supabaseAdmin
      .from("seeker_email_connections")
      .select("job_seeker_id, is_active, gmail_email")
      .in("job_seeker_id", seekerIds)
      .eq("is_active", true),
    supabaseAdmin
      .from("inbound_emails")
      .select("job_seeker_id, classification")
      .in("job_seeker_id", seekerIds),
  ]);

  // Build stats map
  const statsMap = new Map<string, SeekerStats>();
  for (const s of seekers) {
    statsMap.set(s.id, { matched: 0, queued: 0, applied: 0, needsAttention: 0, interviews: 0, gmailConnected: false, gmailEmail: null, inboxTotal: 0, inboxInterviews: 0 });
  }

  // Gmail connections
  for (const g of gmailData.data || []) {
    const stats = statsMap.get(g.job_seeker_id);
    if (stats) {
      stats.gmailConnected = true;
      stats.gmailEmail = g.gmail_email;
    }
  }

  // Inbox counts
  for (const e of inboxData.data || []) {
    const stats = statsMap.get(e.job_seeker_id);
    if (stats) {
      stats.inboxTotal++;
      if (e.classification === "interview_invite") {
        stats.inboxInterviews++;
      }
    }
  }

  // Count matches above threshold
  const thresholdMap = new Map(seekers.map((s) => [s.id, s.match_threshold ?? 60]));
  for (const m of matchesData.data || []) {
    const stats = statsMap.get(m.job_seeker_id);
    const threshold = thresholdMap.get(m.job_seeker_id) ?? 60;
    if (stats && m.score >= threshold) {
      stats.matched++;
    }
  }

  // Count queue items
  for (const q of queueData.data || []) {
    const stats = statsMap.get(q.job_seeker_id);
    if (stats && q.status === "QUEUED") {
      stats.queued++;
    }
  }

  // Count runs
  for (const r of runsData.data || []) {
    const stats = statsMap.get(r.job_seeker_id);
    if (!stats) continue;
    if (r.status === "APPLIED" || r.status === "COMPLETED") {
      stats.applied++;
    } else if (r.status === "NEEDS_ATTENTION") {
      stats.needsAttention++;
    }
  }

  // Count upcoming interviews
  for (const i of interviewsData.data || []) {
    const stats = statsMap.get(i.job_seeker_id);
    if (stats && i.status === "confirmed") {
      stats.interviews++;
    }
  }

  // Combine data
  const seekersWithStats = seekers.map((s) => ({
    ...s,
    stats: statsMap.get(s.id) || { matched: 0, queued: 0, applied: 0, needsAttention: 0, interviews: 0, gmailConnected: false, gmailEmail: null, inboxTotal: 0, inboxInterviews: 0 },
  }));

  return <SeekersClient seekers={seekersWithStats} />;
}
