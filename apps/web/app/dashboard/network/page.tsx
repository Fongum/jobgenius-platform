import { notFound } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import NetworkClient from "./NetworkClient";

export default async function NetworkPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") return notFound();

  // Fetch network contacts with match counts
  const { data: contacts } = await supabaseAdmin
    .from("network_contacts")
    .select("*")
    .eq("account_manager_id", user.id)
    .neq("status", "inactive")
    .order("created_at", { ascending: false });

  const contactIds = (contacts || []).map((c) => c.id);

  // Fetch pending match counts
  let matchCountMap: Record<string, number> = {};
  if (contactIds.length > 0) {
    const { data: matchRows } = await supabaseAdmin
      .from("network_contact_matches")
      .select("network_contact_id")
      .in("network_contact_id", contactIds)
      .eq("status", "pending");

    if (matchRows) {
      for (const m of matchRows) {
        matchCountMap[m.network_contact_id] =
          (matchCountMap[m.network_contact_id] || 0) + 1;
      }
    }
  }

  const contactsWithCounts = (contacts || []).map((c) => ({
    ...c,
    pending_match_count: matchCountMap[c.id] || 0,
  }));

  // Fetch pending matches with related data
  let matches: unknown[] = [];
  if (contactIds.length > 0) {
    const { data: matchData } = await supabaseAdmin
      .from("network_contact_matches")
      .select(`
        id, network_contact_id, job_post_id, job_seeker_id,
        match_reason, status, created_at,
        network_contacts (id, full_name, contact_type, company_name, email),
        job_posts (id, title, company, url),
        job_seekers (id, full_name, email)
      `)
      .in("network_contact_id", contactIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    matches = matchData || [];
  }

  return (
    <NetworkClient
      contacts={contactsWithCounts as Parameters<typeof NetworkClient>[0]["contacts"]}
      matches={matches as Parameters<typeof NetworkClient>[0]["matches"]}
    />
  );
}
