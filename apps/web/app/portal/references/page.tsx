import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ReferencesClient from "./ReferencesClient";

export default async function ReferencesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: references } = await supabaseAdmin
    .from("job_seeker_references")
    .select("*")
    .eq("job_seeker_id", user.id)
    .order("created_at", { ascending: true });

  return <ReferencesClient initialReferences={references || []} />;
}
