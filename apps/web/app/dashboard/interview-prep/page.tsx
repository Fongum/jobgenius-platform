import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";
import InterviewPrepClient from "./InterviewPrepClient";

type PrepRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  created_at: string;
  updated_at: string;
  job_posts:
    | {
        title: string;
        company: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
      }>
    | null;
  job_seekers:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
};

export default async function InterviewPrepPage() {
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", accountManager.id);

  if (assignmentsError) {
    throw new Error("Failed to load job seeker assignments.");
  }

  const seekerIds = (assignments ?? []).map(
    (assignment) => assignment.job_seeker_id
  );

  if (seekerIds.length === 0) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  const { data: preps, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, created_at, updated_at, job_posts (title, company), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: false });

  if (prepError) {
    throw new Error("Failed to load interview prep.");
  }

  return (
    <main>
      <h1>Interview Prep</h1>
      <p>Account Manager: {amEmail}</p>
      <InterviewPrepClient items={(preps ?? []) as PrepRow[]} amEmail={amEmail} />
    </main>
  );
}
