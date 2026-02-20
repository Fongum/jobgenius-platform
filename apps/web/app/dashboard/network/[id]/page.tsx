import { notFound } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ContactDetailClient from "./ContactDetailClient";

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") return notFound();

  // Fetch contact (must belong to this AM)
  const { data: contact, error } = await supabaseAdmin
    .from("network_contacts")
    .select("*")
    .eq("id", params.id)
    .eq("account_manager_id", user.id)
    .single();

  if (error || !contact) return notFound();

  // Fetch all matches (all statuses) with related data
  const { data: matchData } = await supabaseAdmin
    .from("network_contact_matches")
    .select(`
      id, job_post_id, job_seeker_id, match_reason, status, created_at,
      job_posts (id, title, company, url),
      job_seekers (id, full_name, email)
    `)
    .eq("network_contact_id", params.id)
    .order("created_at", { ascending: false });

  // Fetch activity log
  const { data: activityData } = await supabaseAdmin
    .from("network_contact_activity")
    .select("id, activity_type, details, created_at")
    .eq("network_contact_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Attach a pending_match_count for type compatibility with ContactRow
  const pendingCount = (matchData ?? []).filter((m) => m.status === "pending").length;
  const contactWithCount = { ...contact, pending_match_count: pendingCount };
  const normalizedMatches = (matchData ?? []).map((m) => ({
    ...m,
    job_posts: Array.isArray(m.job_posts) ? (m.job_posts[0] ?? null) : (m.job_posts ?? null),
    job_seekers: Array.isArray(m.job_seekers) ? (m.job_seekers[0] ?? null) : (m.job_seekers ?? null),
  }));

  return (
    <ContactDetailClient
      contact={contactWithCount as Parameters<typeof ContactDetailClient>[0]["contact"]}
      matches={normalizedMatches as Parameters<typeof ContactDetailClient>[0]["matches"]}
      activity={(activityData ?? []) as Parameters<typeof ContactDetailClient>[0]["activity"]}
    />
  );
}
