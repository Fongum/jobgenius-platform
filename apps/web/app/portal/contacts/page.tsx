import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ContactsClient from "./ContactsClient";

export default async function PortalContactsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "job_seeker") redirect("/login");

  // Fetch contacts for this job seeker
  const { data: contacts } = await supabaseAdmin
    .from("outreach_contacts")
    .select("id, full_name, role, email, company_name, linkedin_url, phone, source, created_at")
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return <ContactsClient contacts={contacts || []} />;
}
