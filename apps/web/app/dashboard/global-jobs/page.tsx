import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import GlobalJobsClient from "./GlobalJobsClient";

export default async function GlobalJobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Get assigned job seekers for the "Assign to Seeker" dropdown
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select(`
      job_seeker_id,
      job_seekers (
        id,
        full_name,
        email
      )
    `)
    .eq("account_manager_id", user.id);

  const seekers = (assignments || [])
    .map((a) => a.job_seekers as unknown as { id: string; full_name: string | null; email: string } | null)
    .filter(Boolean) as { id: string; full_name: string | null; email: string }[];

  // Get counts by source type
  const { count: totalScraped } = await supabaseAdmin
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "extension_scrape");

  const { count: totalDiscovery } = await supabaseAdmin
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "discovery");

  const { count: totalManual } = await supabaseAdmin
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "manual");

  const { count: totalParsed } = await supabaseAdmin
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .not("parsed_at", "is", null);

  const { count: totalMatched } = await supabaseAdmin
    .from("job_match_scores")
    .select("id", { count: "exact", head: true });

  return (
    <GlobalJobsClient
      seekers={seekers}
      totalScraped={totalScraped ?? 0}
      totalDiscovery={totalDiscovery ?? 0}
      totalManual={totalManual ?? 0}
      totalParsed={totalParsed ?? 0}
      totalMatched={totalMatched ?? 0}
    />
  );
}
