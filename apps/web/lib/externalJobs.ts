/**
 * External Job Providers
 *
 * Fetches remote job listings from free public APIs.
 * All providers are run in parallel via fetchAllExternalJobs().
 */

export type ExternalJob = {
  external_id: string;
  source: string;
  title: string;
  company_name: string | null;
  company_logo: string | null;
  location: string;
  salary: string | null;
  job_type: string | null;
  category: string | null;
  url: string;
  fetched_at: string;
};

// ──────────────────────────────────────────────────────────
// Category inference
// ──────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: 'engineering', keywords: ['engineer', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'full-stack', 'devops', 'platform', 'infrastructure', 'sre', 'cloud', 'embedded', 'firmware'] },
  { category: 'design', keywords: ['designer', 'ux', 'ui', 'product design', 'graphic', 'figma', 'creative'] },
  { category: 'data', keywords: ['data scientist', 'data engineer', 'data analyst', 'machine learning', 'ml ', 'ai ', 'analytics', 'business intelligence', 'bi '] },
  { category: 'product', keywords: ['product manager', 'product owner', 'pm ', 'roadmap'] },
  { category: 'marketing', keywords: ['marketing', 'seo', 'growth', 'demand generation', 'content', 'copywriter', 'brand'] },
  { category: 'sales', keywords: ['sales', 'account executive', 'account manager', 'business development', 'bdr', 'sdr', 'revenue'] },
  { category: 'customer_success', keywords: ['customer success', 'customer support', 'support engineer', 'technical support', 'client success'] },
  { category: 'operations', keywords: ['operations', 'project manager', 'program manager', 'scrum', 'agile coach'] },
  { category: 'finance', keywords: ['finance', 'accounting', 'controller', 'cfo', 'bookkeeper', 'payroll'] },
  { category: 'hr', keywords: ['human resources', 'recruiter', 'talent acquisition', 'people ops', 'hr '] },
  { category: 'legal', keywords: ['legal', 'counsel', 'attorney', 'paralegal', 'compliance'] },
  { category: 'security', keywords: ['security', 'cybersecurity', 'penetration test', 'soc analyst', 'infosec'] },
  { category: 'qa', keywords: ['qa ', 'quality assurance', 'test engineer', 'sdet', 'automation test'] },
];

export function deriveCategory(...texts: string[]): string | null {
  const combined = texts.join(' ').toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return category;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────
// Provider: Remotive
// ──────────────────────────────────────────────────────────

export async function fetchRemotiveExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?limit=200', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs.map((job) => ({
      external_id: String(job.id),
      source: 'remotive',
      title: job.title ?? '',
      company_name: job.company_name ?? null,
      company_logo: job.company_logo_url ?? null,
      location: job.candidate_required_location || 'Remote',
      salary: job.salary || null,
      job_type: job.job_type ?? null,
      category: deriveCategory(job.title ?? '', job.category ?? '', job.tags?.join(' ') ?? ''),
      url: job.url ?? '',
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Jobicy
// ──────────────────────────────────────────────────────────

export async function fetchJobicyExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs.map((job) => ({
      external_id: String(job.id),
      source: 'jobicy',
      title: job.jobTitle ?? '',
      company_name: job.companyName ?? null,
      company_logo: job.companyLogo ?? null,
      location: job.jobGeo || 'Remote',
      salary: job.annualSalaryMin
        ? `${job.annualSalaryMin}–${job.annualSalaryMax ?? ''} ${job.salaryCurrency ?? 'USD'}`
        : null,
      job_type: job.jobType?.[0] ?? null,
      category: deriveCategory(job.jobTitle ?? '', job.jobIndustry?.join(' ') ?? ''),
      url: job.url ?? '',
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Findwork (requires FINDWORK_API_KEY)
// ──────────────────────────────────────────────────────────

export async function fetchFindworkExternalJobs(): Promise<ExternalJob[]> {
  const apiKey = process.env.FINDWORK_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch('https://findwork.dev/api/jobs/?remote=true&limit=100', {
      headers: { Authorization: `Token ${apiKey}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.results) ? data.results : [];
    return jobs.map((job) => ({
      external_id: String(job.id),
      source: 'findwork',
      title: job.role ?? '',
      company_name: job.company_name ?? null,
      company_logo: null,
      location: 'Remote',
      salary: null,
      job_type: job.employment_type ?? null,
      category: deriveCategory(job.role ?? '', job.keywords?.join(' ') ?? ''),
      url: job.url ?? '',
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: RemoteOK (free, no key)
// ──────────────────────────────────────────────────────────

export async function fetchRemoteOKExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Joblinca/1.0 (job refresh agent)' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // First element is a metadata object — skip it
    const jobs: any[] = Array.isArray(data) ? data.slice(1) : [];
    return jobs
      .filter((job) => job.id && job.position && job.url)
      .map((job) => ({
        external_id: String(job.id),
        source: 'remoteok',
        title: job.position ?? '',
        company_name: job.company ?? null,
        company_logo: job.company_logo ?? null,
        location: 'Remote',
        salary: job.salary || null,
        job_type: 'full_time',
        category: deriveCategory(job.position ?? '', (job.tags ?? []).join(' ')),
        url: job.url ?? '',
        fetched_at: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Provider: Arbeitnow (free, no key)
// ──────────────────────────────────────────────────────────

export async function fetchArbeitnowExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: any[] = Array.isArray(data.data) ? data.data : [];
    return jobs
      .filter((job) => job.remote && job.slug && job.url)
      .map((job) => ({
        external_id: job.slug,
        source: 'arbeitnow',
        title: job.title ?? '',
        company_name: job.company_name ?? null,
        company_logo: null,
        location: 'Remote',
        salary: null,
        job_type: job.job_types?.[0] ?? null,
        category: deriveCategory(job.title ?? '', job.description ?? ''),
        url: job.url ?? '',
        fetched_at: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Aggregate: fetch from all providers in parallel
// ──────────────────────────────────────────────────────────

export async function fetchAllExternalJobs(): Promise<{
  jobs: ExternalJob[];
  sourceCounts: Record<string, number>;
  errorSources: string[];
}> {
  const providers: Array<{ name: string; fn: () => Promise<ExternalJob[]> }> = [
    { name: 'remotive', fn: fetchRemotiveExternalJobs },
    { name: 'jobicy', fn: fetchJobicyExternalJobs },
    { name: 'findwork', fn: fetchFindworkExternalJobs },
    { name: 'remoteok', fn: fetchRemoteOKExternalJobs },
    { name: 'arbeitnow', fn: fetchArbeitnowExternalJobs },
  ];

  const results = await Promise.allSettled(providers.map((p) => p.fn()));

  const jobs: ExternalJob[] = [];
  const sourceCounts: Record<string, number> = {};
  const errorSources: string[] = [];

  results.forEach((result, i) => {
    const name = providers[i].name;
    if (result.status === 'fulfilled') {
      sourceCounts[name] = result.value.length;
      jobs.push(...result.value);
    } else {
      sourceCounts[name] = 0;
      errorSources.push(name);
    }
  });

  return { jobs, sourceCounts, errorSources };
}
