-- Migration: Job Discovery & Scraping Infrastructure
-- Adds support for automated job discovery from job boards

-- ============================================================================
-- JOB DISCOVERY SOURCES
-- ============================================================================

create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,              -- 'linkedin', 'indeed', 'glassdoor', etc.
  base_url text not null,                 -- 'https://www.linkedin.com/jobs'
  enabled boolean default true,
  rate_limit_per_minute integer default 10,
  requires_auth boolean default false,
  auth_config jsonb default '{}'::jsonb,  -- credentials, cookies, etc. (encrypted)
  selectors jsonb default '{}'::jsonb,    -- CSS selectors for scraping
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- JOB DISCOVERY SEARCHES (Saved searches for job seekers)
-- ============================================================================

create table if not exists public.job_discovery_searches (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  source_id uuid references public.job_sources(id) on delete cascade,
  search_name text not null,              -- "Remote React Jobs SF"
  search_url text not null,               -- Full search URL with filters
  keywords text[] default '{}',           -- Search keywords
  location text,                          -- Location filter
  filters jsonb default '{}'::jsonb,      -- Additional filters (remote, salary, etc.)
  enabled boolean default true,
  last_run_at timestamptz,
  last_job_count integer default 0,
  run_frequency_hours integer default 24, -- How often to run this search
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- JOB DISCOVERY RUNS (Audit trail for scraping runs)
-- ============================================================================

create table if not exists public.job_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  search_id uuid references public.job_discovery_searches(id) on delete cascade,
  source_name text not null,
  status text not null default 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
  jobs_found integer default 0,
  jobs_new integer default 0,             -- New jobs added (not duplicates)
  jobs_updated integer default 0,         -- Existing jobs updated
  pages_scraped integer default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb default '{}'::jsonb,     -- Debug info, timing, etc.
  created_at timestamptz default now()
);

-- ============================================================================
-- ENHANCE JOB_POSTS FOR DISCOVERY TRACKING
-- ============================================================================

-- External job board ID (for deduplication)
alter table public.job_posts
  add column if not exists external_id text;

-- Which source discovered this job
alter table public.job_posts
  add column if not exists source_name text;

-- Discovery run that found this job
alter table public.job_posts
  add column if not exists discovery_run_id uuid references public.job_discovery_runs(id) on delete set null;

-- When the job was first discovered
alter table public.job_posts
  add column if not exists discovered_at timestamptz;

-- When the job was last seen (for staleness detection)
alter table public.job_posts
  add column if not exists last_seen_at timestamptz;

-- Job posting date from the source
alter table public.job_posts
  add column if not exists posted_at timestamptz;

-- Is the job still active on the source?
alter table public.job_posts
  add column if not exists is_active boolean default true;

-- Update source column to allow more values
-- (Already exists, just documenting expected values: 'extension', 'linkedin', 'indeed', 'glassdoor', etc.)

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For finding jobs by external ID (deduplication)
create index if not exists job_posts_external_id_idx
  on public.job_posts (external_id)
  where external_id is not null;

-- For finding jobs by source
create index if not exists job_posts_source_name_idx
  on public.job_posts (source_name)
  where source_name is not null;

-- For finding stale jobs
create index if not exists job_posts_last_seen_idx
  on public.job_posts (last_seen_at)
  where last_seen_at is not null;

-- For scheduled search runs
create index if not exists job_discovery_searches_next_run_idx
  on public.job_discovery_searches (last_run_at, enabled)
  where enabled = true;

-- For discovery run history
create index if not exists job_discovery_runs_search_idx
  on public.job_discovery_runs (search_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.job_sources enable row level security;
alter table public.job_discovery_searches enable row level security;
alter table public.job_discovery_runs enable row level security;

-- Job sources: AMs can read, only service role can modify
create policy "am_select_job_sources"
  on public.job_sources
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- Discovery searches: AMs can manage for their assigned seekers
create policy "am_select_discovery_searches"
  on public.job_discovery_searches
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_discovery_searches.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_discovery_searches"
  on public.job_discovery_searches
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_discovery_searches.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_discovery_searches"
  on public.job_discovery_searches
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_discovery_searches.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_delete_discovery_searches"
  on public.job_discovery_searches
  for delete
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_discovery_searches.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- Discovery runs: Read-only for AMs (system creates them)
create policy "am_select_discovery_runs"
  on public.job_discovery_runs
  for select
  using (
    exists (
      select 1
      from public.job_discovery_searches searches
      join public.job_seeker_assignments assignments on assignments.job_seeker_id = searches.job_seeker_id
      join public.account_managers am on am.id = assignments.account_manager_id
      where searches.id = job_discovery_runs.search_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- ============================================================================
-- SEED DEFAULT JOB SOURCES
-- ============================================================================

insert into public.job_sources (name, base_url, rate_limit_per_minute, requires_auth, selectors) values
  ('linkedin', 'https://www.linkedin.com/jobs/search', 5, false, '{
    "job_cards": ".jobs-search__results-list > li",
    "job_title": ".base-search-card__title",
    "job_company": ".base-search-card__subtitle",
    "job_location": ".job-search-card__location",
    "job_link": ".base-card__full-link",
    "job_id_attr": "data-entity-urn",
    "next_page": "button[aria-label=\"See more jobs\"]",
    "load_more_type": "infinite_scroll"
  }'::jsonb),
  ('indeed', 'https://www.indeed.com/jobs', 10, false, '{
    "job_cards": ".job_seen_beacon, .resultContent",
    "job_title": ".jobTitle span[title], h2.jobTitle",
    "job_company": "[data-testid=\"company-name\"], .companyName",
    "job_location": "[data-testid=\"text-location\"], .companyLocation",
    "job_link": ".jcs-JobTitle",
    "job_id_attr": "data-jk",
    "next_page": "[data-testid=\"pagination-page-next\"]",
    "load_more_type": "pagination"
  }'::jsonb),
  ('glassdoor', 'https://www.glassdoor.com/Job', 5, false, '{
    "job_cards": "[data-test=\"jobListing\"]",
    "job_title": "[data-test=\"job-title\"]",
    "job_company": "[data-test=\"employer-name\"]",
    "job_location": "[data-test=\"emp-location\"]",
    "job_link": "[data-test=\"job-title\"]",
    "job_id_attr": "data-id",
    "next_page": "[data-test=\"pagination-next\"]",
    "load_more_type": "pagination"
  }'::jsonb)
on conflict (name) do nothing;

-- ============================================================================
-- COMMENTS
-- ============================================================================

comment on table public.job_sources is 'Supported job boards for automated discovery';
comment on table public.job_discovery_searches is 'Saved searches that run periodically to discover new jobs';
comment on table public.job_discovery_runs is 'Audit log of discovery/scraping runs';
comment on column public.job_posts.external_id is 'Job ID from the source job board (for deduplication)';
comment on column public.job_posts.source_name is 'Which job board this job was discovered from';
