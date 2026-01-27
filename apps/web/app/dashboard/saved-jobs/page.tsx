import { supabaseServer } from "@/lib/supabase/server";

type SavedJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  created_at: string;
};

export default async function SavedJobsPage() {
  const { data, error } = await supabaseServer
    .from("saved_jobs")
    .select("id, title, company, location, url, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error("Failed to load saved jobs.");
  }

  const jobs = (data ?? []) as SavedJob[];

  return (
    <main>
      <h1>Saved Jobs</h1>
      {jobs.length === 0 ? (
        <p>No jobs yet.</p>
      ) : (
        <ul>
          {jobs.map((job) => (
            <li key={job.id}>
              <strong>{job.title}</strong>
              {job.company ? ` - ${job.company}` : ""}
              {job.location ? ` (${job.location})` : ""}
              {" - "}
              <a href={job.url} target="_blank" rel="noreferrer">
                Link
              </a>
              {" - "}
              <time dateTime={job.created_at}>
                {new Date(job.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}