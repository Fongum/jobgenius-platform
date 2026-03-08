import { supabaseAdmin } from "@/lib/auth";
import { requireOpsAuth } from "@/lib/ops-auth";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { isAdminRole } from "@/lib/auth/roles";
import { deriveCategory, type ExternalJob } from "@/lib/externalJobs";

/**
 * POST /api/admin/career-crawl
 *
 * Crawl monitored company career pages (Greenhouse/Lever/Ashby boards)
 * and upsert discovered jobs into external_jobs.
 *
 * Auth: Admin AM or OPS key.
 */
export async function POST(request: Request) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { data: amData } = await supabaseAdmin
      .from("account_managers")
      .select("role")
      .eq("id", amResult.accountManager.id)
      .single();
    if (!amData || !isAdminRole(amData.role)) {
      return Response.json({ error: "Admin access required." }, { status: 403 });
    }
  }

  // Fetch active career pages
  const { data: pages, error: pagesError } = await supabaseAdmin
    .from("company_career_pages")
    .select("*")
    .eq("is_active", true);

  if (pagesError || !pages) {
    return Response.json({ error: "Failed to load career pages." }, { status: 500 });
  }

  const results: Array<{ company: string; ats: string; jobs_found: number; error?: string }> = [];
  let totalJobs = 0;

  for (const page of pages) {
    try {
      let jobs: ExternalJob[] = [];

      if (page.ats_type === "greenhouse" && page.board_token) {
        jobs = await crawlGreenhouseBoard(page.board_token, page.company_name);
      } else if (page.ats_type === "lever" && page.board_token) {
        jobs = await crawlLeverBoard(page.board_token, page.company_name);
      } else if (page.ats_type === "ashby" && page.board_token) {
        jobs = await crawlAshbyBoard(page.board_token, page.company_name);
      } else {
        results.push({ company: page.company_name, ats: page.ats_type ?? "unknown", jobs_found: 0, error: "Unsupported ATS or missing board_token" });
        continue;
      }

      // Upsert into external_jobs
      if (jobs.length > 0) {
        const rows = jobs.map((j) => ({
          external_id: j.external_id,
          source: j.source,
          title: j.title,
          company_name: j.company_name,
          company_logo: j.company_logo,
          location: j.location,
          salary: j.salary,
          job_type: j.job_type,
          category: j.category,
          url: j.url,
          fetched_at: j.fetched_at,
          is_stale: false,
        }));

        const { error: upsertError } = await supabaseAdmin
          .from("external_jobs")
          .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: false });

        if (upsertError) {
          results.push({ company: page.company_name, ats: page.ats_type!, jobs_found: 0, error: upsertError.message });
          continue;
        }
      }

      // Update career page metadata
      await supabaseAdmin
        .from("company_career_pages")
        .update({
          last_checked_at: new Date().toISOString(),
          jobs_found: jobs.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", page.id);

      totalJobs += jobs.length;
      results.push({ company: page.company_name, ats: page.ats_type!, jobs_found: jobs.length });
    } catch (err) {
      results.push({
        company: page.company_name,
        ats: page.ats_type ?? "unknown",
        jobs_found: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    pages_crawled: pages.length,
    total_jobs: totalJobs,
    results,
  });
}

// ──────────────────────────────────────────────────────────
// ATS-specific crawlers
// ──────────────────────────────────────────────────────────

async function crawlGreenhouseBoard(boardToken: string, companyName: string): Promise<ExternalJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`);
  if (!res.ok) return [];
  const data = await res.json();
  const jobs: any[] = data.jobs ?? [];

  return jobs.map((job) => ({
    external_id: `career_gh_${boardToken}_${job.id}`,
    source: `career_greenhouse`,
    title: job.title ?? "",
    company_name: companyName,
    company_logo: null,
    location: job.location?.name ?? "Unknown",
    salary: null,
    job_type: null,
    category: deriveCategory(job.title ?? "", job.content?.slice(0, 500) ?? ""),
    url: job.absolute_url ?? `https://boards.greenhouse.io/${boardToken}/jobs/${job.id}`,
    fetched_at: new Date().toISOString(),
  }));
}

async function crawlLeverBoard(companySlug: string, companyName: string): Promise<ExternalJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${companySlug}?mode=json`);
  if (!res.ok) return [];
  const postings: any[] = await res.json();
  if (!Array.isArray(postings)) return [];

  return postings.map((posting) => ({
    external_id: `career_lever_${companySlug}_${posting.id}`,
    source: `career_lever`,
    title: posting.text ?? "",
    company_name: companyName,
    company_logo: null,
    location: posting.categories?.location ?? "Unknown",
    salary: posting.salaryRange
      ? `${posting.salaryRange.min ?? ""} - ${posting.salaryRange.max ?? ""} ${posting.salaryRange.currency ?? "USD"}`
      : null,
    job_type: posting.categories?.commitment ?? null,
    category: deriveCategory(posting.text ?? "", posting.categories?.team ?? ""),
    url: posting.hostedUrl ?? posting.applyUrl ?? `https://jobs.lever.co/${companySlug}/${posting.id}`,
    fetched_at: new Date().toISOString(),
  }));
}

async function crawlAshbyBoard(boardToken: string, companyName: string): Promise<ExternalJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${boardToken}`);
  if (!res.ok) return [];
  const data = await res.json();
  const jobs: any[] = data.jobs ?? [];

  return jobs.map((job) => ({
    external_id: `career_ashby_${boardToken}_${job.id}`,
    source: `career_ashby`,
    title: job.title ?? "",
    company_name: companyName,
    company_logo: null,
    location: job.location ?? "Unknown",
    salary: null,
    job_type: job.employmentType ?? null,
    category: deriveCategory(job.title ?? "", job.departmentName ?? ""),
    url: job.jobUrl ?? `https://jobs.ashbyhq.com/${boardToken}/${job.id}`,
    fetched_at: new Date().toISOString(),
  }));
}
