import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import InterviewsClient from "./InterviewsClient";
import { redirect } from "next/navigation";

type InterviewRow = {
  id: string;
  job_post_id: string;
  job_seeker_id: string;
  account_manager_id: string;
  scheduled_at: string | null;
  duration_min: number;
  interview_type: string;
  meeting_link: string | null;
  status: string;
  candidate_token: string;
  created_at: string;
  job_posts:
    | { title: string; company: string | null }
    | Array<{ title: string; company: string | null }>
    | null;
  job_seekers:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

export default async function InterviewsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: interviews, error } = await supabaseServer
    .from("interviews")
    .select(
      "id, job_post_id, job_seeker_id, account_manager_id, scheduled_at, duration_min, interview_type, meeting_link, status, candidate_token, created_at, job_posts (title, company), job_seekers (full_name, email)"
    )
    .eq("account_manager_id", user.id)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (error) {
    return (
      <main>
        <h1>Interviews</h1>
        <p>Failed to load interviews.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Interviews</h1>
      <p>Account Manager: {user.email}</p>
      <InterviewsClient
        interviews={(interviews ?? []) as InterviewRow[]}
      />
    </main>
  );
}
