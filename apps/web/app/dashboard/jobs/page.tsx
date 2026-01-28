import { supabaseServer } from "@/lib/supabase/server";

type JobPost = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  source: string | null;
  url: string;
  created_at: string;
};

type JobsPageProps = {
  searchParams?: {
    source?: string;
    company?: string;
    title?: string;
    sort?: string;
  };
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const sourceFilter = searchParams?.source?.trim();
  const companyFilter = searchParams?.company?.trim();
  const titleFilter = searchParams?.title?.trim();
  const sort = searchParams?.sort === "asc" ? "asc" : "desc";

  let query = supabaseServer
    .from("job_posts")
    .select("id, title, company, location, source, url, created_at", {
      count: "exact",
    });

  if (sourceFilter) {
    query = query.eq("source", sourceFilter);
  }

  if (companyFilter) {
    query = query.ilike("company", `%${companyFilter}%`);
  }

  if (titleFilter) {
    query = query.ilike("title", `%${titleFilter}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: sort === "asc" })
    .limit(50);

  if (error) {
    throw new Error("Failed to load job posts.");
  }

  const jobs = (data ?? []) as JobPost[];

  return (
    <main>
      <h1>Global Jobs Catalog</h1>
      <form method="get">
        <label>
          Source{" "}
          <input
            name="source"
            defaultValue={sourceFilter ?? ""}
            placeholder="extension"
          />
        </label>
        <label>
          Company{" "}
          <input
            name="company"
            defaultValue={companyFilter ?? ""}
            placeholder="Search company"
          />
        </label>
        <label>
          Title{" "}
          <input
            name="title"
            defaultValue={titleFilter ?? ""}
            placeholder="Search title"
          />
        </label>
        <label>
          Sort{" "}
          <select name="sort" defaultValue={sort}>
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      <p>Total jobs: {count ?? jobs.length}</p>
      {jobs.length === 0 ? (
        <p>No jobs found.</p>
      ) : (
        <ul>
          {jobs.map((job) => (
            <li key={job.id}>
              <strong>{job.title}</strong>
              {job.company ? ` - ${job.company}` : ""}
              {job.location ? ` (${job.location})` : ""}
              {job.source ? ` [${job.source}]` : ""}
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
