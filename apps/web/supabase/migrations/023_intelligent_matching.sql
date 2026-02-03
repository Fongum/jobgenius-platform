-- Migration: Intelligent Match Scoring
-- Adds enhanced preference fields for job seekers and structured data extraction for job posts

-- ============================================================================
-- JOB SEEKER PREFERENCES ENHANCEMENT
-- ============================================================================

-- Industry preferences (e.g., ['technology', 'finance', 'healthcare'])
alter table public.job_seekers
  add column if not exists preferred_industries text[] default '{}';

-- Company size preferences (e.g., ['startup', 'mid-size', 'enterprise'])
-- startup: 1-50, mid-size: 51-500, enterprise: 500+
alter table public.job_seekers
  add column if not exists preferred_company_sizes text[] default '{}';

-- Negative keywords - jobs containing these should be penalized
alter table public.job_seekers
  add column if not exists exclude_keywords text[] default '{}';

-- Years of experience the seeker has
alter table public.job_seekers
  add column if not exists years_experience integer;

-- Preferred locations (multiple cities/regions)
alter table public.job_seekers
  add column if not exists preferred_locations text[] default '{}';

-- Whether seeker is open to relocation
alter table public.job_seekers
  add column if not exists open_to_relocation boolean default false;

-- Visa sponsorship required
alter table public.job_seekers
  add column if not exists requires_visa_sponsorship boolean default false;

-- ============================================================================
-- JOB POST STRUCTURED DATA
-- ============================================================================

-- Extracted/parsed salary range
alter table public.job_posts
  add column if not exists salary_min integer;

alter table public.job_posts
  add column if not exists salary_max integer;

-- Extracted seniority level (junior, mid, senior, lead, principal, etc.)
alter table public.job_posts
  add column if not exists seniority_level text;

-- Extracted work type (remote, hybrid, on-site)
alter table public.job_posts
  add column if not exists work_type text;

-- Extracted required years of experience
alter table public.job_posts
  add column if not exists years_experience_min integer;

alter table public.job_posts
  add column if not exists years_experience_max integer;

-- Extracted required skills (parsed from description)
alter table public.job_posts
  add column if not exists required_skills text[] default '{}';

-- Extracted preferred/nice-to-have skills
alter table public.job_posts
  add column if not exists preferred_skills text[] default '{}';

-- Industry classification
alter table public.job_posts
  add column if not exists industry text;

-- Company size category if detectable
alter table public.job_posts
  add column if not exists company_size text;

-- Whether visa sponsorship is offered
alter table public.job_posts
  add column if not exists offers_visa_sponsorship boolean;

-- Employment type (full-time, part-time, contract, internship)
alter table public.job_posts
  add column if not exists employment_type text;

-- Timestamp when structured data was last extracted
alter table public.job_posts
  add column if not exists parsed_at timestamptz;

-- ============================================================================
-- ENHANCED MATCH SCORES - More detailed breakdown
-- ============================================================================

-- Add detailed score breakdown to match_scores
-- The reasons jsonb column already exists, we'll use it to store:
-- {
--   "component_scores": {
--     "skills": { "score": 35, "max": 35, "matched": [...], "missing": [...] },
--     "title": { "score": 20, "max": 20, "matched": [...] },
--     "experience": { "score": 10, "max": 10, "match_type": "exact|close|mismatch" },
--     "salary": { "score": 10, "max": 10, "overlap_pct": 80 },
--     "location": { "score": 10, "max": 10, "match_type": "exact|region|remote" },
--     "company_fit": { "score": 10, "max": 10, "industry_match": true, "size_match": true },
--     "penalties": { "score": -5, "reasons": ["exclude_keyword: management"] }
--   },
--   "confidence": "high|medium|low",
--   "recommendation": "strong_match|good_match|marginal|poor_fit"
-- }

-- Add confidence level for the match
alter table public.job_match_scores
  add column if not exists confidence text;

-- Add recommendation category
alter table public.job_match_scores
  add column if not exists recommendation text;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

create index if not exists job_posts_parsed_at_idx
  on public.job_posts (parsed_at)
  where parsed_at is null;

create index if not exists job_posts_industry_idx
  on public.job_posts (industry)
  where industry is not null;

create index if not exists job_seekers_industries_idx
  on public.job_seekers using gin (preferred_industries)
  where preferred_industries != '{}';

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on column public.job_seekers.preferred_industries is
  'Array of industry preferences: technology, finance, healthcare, retail, manufacturing, etc.';

comment on column public.job_seekers.preferred_company_sizes is
  'Array of company size preferences: startup (1-50), mid-size (51-500), enterprise (500+)';

comment on column public.job_seekers.exclude_keywords is
  'Keywords that should penalize a job match (e.g., "clearance required", "management")';

comment on column public.job_posts.required_skills is
  'Skills explicitly marked as required in the job posting';

comment on column public.job_posts.preferred_skills is
  'Skills marked as preferred/nice-to-have in the job posting';

comment on column public.job_match_scores.confidence is
  'Match confidence: high (lots of data), medium (some gaps), low (limited data)';

comment on column public.job_match_scores.recommendation is
  'Match recommendation: strong_match, good_match, marginal, poor_fit';
