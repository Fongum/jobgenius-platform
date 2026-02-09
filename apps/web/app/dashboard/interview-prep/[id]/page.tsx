import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type PageProps = {
  params: { id: string };
};

type PrepRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  content: {
    role_summary?: string;
    company_notes?: string[];
    likely_questions?: string[];
    answer_structure?: string[];
    technical_topics?: string[];
    behavioral_topics?: string[];
    checklist?: string[];
    thirty_sixty_ninety?: string[];
  };
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

function renderList(items?: string[]) {
  if (!items || items.length === 0) {
    return <p>-</p>;
  }
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default async function InterviewPrepDetailPage({ params }: PageProps) {
  const prepId = params.id;
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, content, job_posts (title, company), job_seekers (full_name, email)"
    )
    .eq("id", prepId)
    .single();

  if (prepError || !prep) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>Interview prep not found.</p>
      </main>
    );
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", user.id)
    .eq("job_seeker_id", prep.job_seeker_id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>Not authorized for this job seeker.</p>
      </main>
    );
  }

  const row = prep as PrepRow;
  const post = Array.isArray(row.job_posts) ? row.job_posts[0] : row.job_posts;
  const seeker = Array.isArray(row.job_seekers)
    ? row.job_seekers[0]
    : row.job_seekers;

  return (
    <main>
      <h1>Interview Prep</h1>
      <p>
        {post?.title ?? "Role"} {post?.company ? `- ${post.company}` : ""}
      </p>
      <p>
        Job seeker: {seeker?.full_name ?? "Unknown"}{" "}
        {seeker?.email ? `(${seeker.email})` : ""}
      </p>
      <a href={`/api/interview-prep/${row.id}/pdf`}>Download PDF</a>
      <section>
        <h2>Role Summary</h2>
        <p>{row.content?.role_summary ?? "-"}</p>
        <h2>Company Notes</h2>
        {renderList(row.content?.company_notes)}
        <h2>Likely Questions</h2>
        {renderList(row.content?.likely_questions)}
        <h2>Suggested Answer Structure</h2>
        {renderList(row.content?.answer_structure)}
        <h2>Technical Topics</h2>
        {renderList(row.content?.technical_topics)}
        <h2>Behavioral Topics</h2>
        {renderList(row.content?.behavioral_topics)}
        <h2>Checklist</h2>
        {renderList(row.content?.checklist)}
        <h2>30/60/90 Day Prompts</h2>
        {renderList(row.content?.thirty_sixty_ninety)}
      </section>
    </main>
  );
}
