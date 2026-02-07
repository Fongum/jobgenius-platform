-- Migration: Match Weights & Job Bank Enhancements
-- Adds per-seeker custom scoring weights for AM adjustment
-- Adds job bank tracking fields

-- ============================================================================
-- CUSTOM MATCH WEIGHTS PER SEEKER
-- ============================================================================

-- Allow AMs to customize scoring weights per job seeker
-- JSON structure: { "skills": 35, "title": 20, "experience": 10, "salary": 10, "location": 15, "company_fit": 10, "max_penalty": 15 }
alter table public.job_seekers
  add column if not exists match_weights jsonb;

comment on column public.job_seekers.match_weights is
  'Custom scoring weights for this seeker. If null, defaults apply: skills=35, title=20, experience=10, salary=10, location=15, company_fit=10, max_penalty=15';

-- ============================================================================
-- JOB BANK TRACKING
-- ============================================================================

-- Track when jobs were last seen (for deduplication and staleness)
alter table public.job_posts
  add column if not exists last_seen_at timestamptz;

-- Track whether jobs are still active on the source
alter table public.job_posts
  add column if not exists is_active boolean default true;

-- Track the source type for filtering (extension_scrape, discovery, manual)
alter table public.job_posts
  add column if not exists source_type text default 'manual';

-- Track which AM scraped the job (from extension)
alter table public.job_posts
  add column if not exists scraped_by_am_id uuid references public.account_managers(id);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists job_posts_is_active_idx
  on public.job_posts (is_active)
  where is_active = true;

create index if not exists job_posts_source_type_idx
  on public.job_posts (source_type);

create index if not exists job_posts_last_seen_at_idx
  on public.job_posts (last_seen_at);

create index if not exists job_match_scores_score_idx
  on public.job_match_scores (job_seeker_id, score desc);

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

comment on column public.job_posts.is_active is
  'Whether this job is still active on the source site. Set to false when stale.';

comment on column public.job_posts.source_type is
  'How the job was added: extension_scrape, discovery, manual';

comment on column public.job_posts.last_seen_at is
  'When this job was last seen during scraping (for deduplication)';
