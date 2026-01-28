create table if not exists public.account_managers (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  created_at timestamptz default now()
);

create table if not exists public.job_seekers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text unique,
  location text,
  seniority text,
  salary_min integer,
  salary_max integer,
  work_type text,
  target_titles text[] default '{}',
  skills text[] default '{}',
  resume_text text,
  created_at timestamptz default now()
);

create table if not exists public.job_seeker_assignments (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  account_manager_id uuid references public.account_managers(id) on delete cascade,
  created_at timestamptz default now(),
  unique (job_seeker_id)
);

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  company text,
  location text,
  description_text text,
  source text default 'extension',
  created_at timestamptz default now()
);

create table if not exists public.job_match_scores (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid references public.job_posts(id) on delete cascade,
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100),
  reasons jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (job_post_id, job_seeker_id)
);

create table if not exists public.job_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid references public.job_posts(id) on delete cascade,
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  threshold integer not null default 60,
  decision text not null,
  decided_by text not null,
  note text,
  created_at timestamptz default now(),
  unique (job_post_id, job_seeker_id)
);

create index if not exists job_posts_created_at_idx on public.job_posts (created_at desc);
create index if not exists job_match_scores_score_idx on public.job_match_scores (score desc);
create index if not exists job_routing_decisions_decision_idx on public.job_routing_decisions (decision);
