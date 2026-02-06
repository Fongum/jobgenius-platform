import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: documents } = await supabaseAdmin
    .from("job_seeker_documents")
    .select("*")
    .eq("job_seeker_id", user.id)
    .eq("doc_type", "resume")
    .order("uploaded_at", { ascending: false });

  return (
    <ProfileClient
      profile={profile || {}}
      documents={documents || []}
    />
  );
}
