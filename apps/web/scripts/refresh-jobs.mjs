#!/usr/bin/env node
/**
 * Standalone Job Refresh Script
 *
 * Fetches remote jobs from all 5 providers in parallel and upserts them
 * into the external_jobs table in Supabase. Also logs each run to cron_runs.
 *
 * Usage:
 *   node --env-file=.env.local scripts/refresh-jobs.mjs
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   FINDWORK_API_KEY   (for Findwork provider)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FINDWORK_API_KEY = process.env.FINDWORK_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ──────────────────────────────────────────────────────────
// Category inference
// ──────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = [
  { category: 'engineering', keywords: ['engineer', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'devops', 'platform', 'infrastructure', 'sre', 'cloud'] },
  { category: 'design', keywords: ['designer', 'ux', 'ui', 'product design', 'graphic', 'figma'] },
  { category: 'data', keywords: ['data scientist', 'data engineer', 'data analyst', 'machine learning', 'ml ', 'ai ', 'analytics'] },
  { category: 'product', keywords: ['product manager', 'product owner', 'pm '] },
  { category: 'marketing', keywords: ['marketing', 'seo', 'growth', 'content', 'copywriter'] },
  { category: 'sales', keywords: ['sales', 'account executive', 'business development', 'bdr', 'sdr'] },
  { category: 'customer_success', keywords: ['customer success', 'customer support', 'support engineer'] },
  { category: 'operations', keywords: ['operations', 'project manager', 'program manager'] },
  { category: 'finance', keywords: ['finance', 'accounting', 'controller', 'cfo'] },
  { category: 'hr', keywords: ['human resources', 'recruiter', 'talent acquisition'] },
  { category: 'security', keywords: ['security', 'cybersecurity', 'penetration test'] },
  { category: 'qa', keywords: ['qa ', 'quality assurance', 'test engineer', 'sdet'] },
];

function deriveCategory(...texts) {
  const combined = texts.join(' ').toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => combined.includes(kw))) return category;
  }
  return null;
}

// ──────────────────────────────────────────────────────────
// Providers
// ──────────────────────────────────────────────────────────

async function fetchRemotive() {
  const res = await fetch('https://remotive.com/api/remote-jobs?limit=200');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs ?? []).map((job) => ({
    external_id: String(job.id),
    source: 'remotive',
    title: job.title ?? '',
    company_name: job.company_name ?? null,
    company_logo: job.company_logo_url ?? null,
    location: job.candidate_required_location || 'Remote',
    salary: job.salary || null,
    job_type: job.job_type ?? null,
    category: deriveCategory(job.title ?? '', job.category ?? '', (job.tags ?? []).join(' ')),
    url: job.url ?? '',
    fetched_at: new Date().toISOString(),
  }));
}

async function fetchJobicy() {
  const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs ?? []).map((job) => ({
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
    category: deriveCategory(job.jobTitle ?? '', (job.jobIndustry ?? []).join(' ')),
    url: job.url ?? '',
    fetched_at: new Date().toISOString(),
  }));
}

async function fetchFindwork() {
  if (!FINDWORK_API_KEY) { console.log('[findwork] FINDWORK_API_KEY not set, skipping'); return []; }
  const res = await fetch('https://findwork.dev/api/jobs/?remote=true&limit=100', {
    headers: { Authorization: `Token ${FINDWORK_API_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((job) => ({
    external_id: String(job.id),
    source: 'findwork',
    title: job.role ?? '',
    company_name: job.company_name ?? null,
    company_logo: null,
    location: 'Remote',
    salary: null,
    job_type: job.employment_type ?? null,
    category: deriveCategory(job.role ?? '', (job.keywords ?? []).join(' ')),
    url: job.url ?? '',
    fetched_at: new Date().toISOString(),
  }));
}

async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'Joblinca/1.0 (job refresh script)' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data.slice(1) : [])
    .filter((j) => j.id && j.position && j.url)
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
}

async function fetchArbeitnow() {
  const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data ?? [])
    .filter((j) => j.remote && j.slug && j.url)
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
}

// ──────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('[refresh-jobs] Starting…');
  const startMs = Date.now();

  // Open cron_run record
  const { data: runRow, error: runErr } = await supabase
    .from('cron_runs')
    .insert({ triggered_by: 'script', status: 'running' })
    .select('id')
    .single();

  if (runErr || !runRow) {
    console.error('[refresh-jobs] Failed to insert cron_runs row:', runErr?.message);
    process.exit(1);
  }
  const runId = runRow.id;
  console.log(`[refresh-jobs] Run ID: ${runId}`);

  try {
    // Fetch all providers in parallel
    const providers = [
      { name: 'remotive', fn: fetchRemotive },
      { name: 'jobicy', fn: fetchJobicy },
      { name: 'findwork', fn: fetchFindwork },
      { name: 'remoteok', fn: fetchRemoteOK },
      { name: 'arbeitnow', fn: fetchArbeitnow },
    ];

    const results = await Promise.allSettled(providers.map((p) => p.fn()));
    const allJobs = [];
    const sourceCounts = {};
    const errorSources = [];

    results.forEach((result, i) => {
      const name = providers[i].name;
      if (result.status === 'fulfilled') {
        sourceCounts[name] = result.value.length;
        allJobs.push(...result.value);
        console.log(`[${name}] fetched ${result.value.length} jobs`);
      } else {
        sourceCounts[name] = 0;
        errorSources.push(name);
        console.error(`[${name}] error:`, result.reason);
      }
    });

    console.log(`[refresh-jobs] Total fetched: ${allJobs.length}`);

    // Upsert per source
    let inserted = 0;
    let errors = 0;
    const sources = [...new Set(allJobs.map((j) => j.source))];

    for (const source of sources) {
      const sourceJobs = allJobs.filter((j) => j.source === source);

      // Delete stale rows for this source
      await supabase.from('external_jobs').delete().eq('source', source);

      // Insert in chunks
      const chunkSize = 500;
      for (let i = 0; i < sourceJobs.length; i += chunkSize) {
        const chunk = sourceJobs.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('external_jobs')
          .upsert(chunk, { onConflict: 'source,external_id', ignoreDuplicates: true });
        if (error) {
          console.error(`[${source}] upsert error:`, error.message);
          errors += chunk.length;
        } else {
          inserted += chunk.length;
        }
      }
    }

    const durationMs = Date.now() - startMs;
    console.log(`[refresh-jobs] Done. inserted=${inserted} errors=${errors} duration=${durationMs}ms`);

    await supabase
      .from('cron_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        fetched: allJobs.length,
        inserted,
        errors: errors + errorSources.length,
        source_counts: sourceCounts,
      })
      .eq('id', runId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[refresh-jobs] Fatal error:', errorMessage);
    await supabase
      .from('cron_runs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq('id', runId);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[refresh-jobs] Uncaught error:', err);
  process.exit(1);
});
