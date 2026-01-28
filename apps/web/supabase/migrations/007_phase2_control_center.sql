alter table public.job_seekers
  add column if not exists match_threshold integer not null default 60;

alter table public.job_posts
  add column if not exists company_website text;

alter table public.application_queue
  add column if not exists category text not null default 'matched';

create index if not exists application_queue_job_seeker_category_idx
  on public.application_queue (job_seeker_id, category);

create index if not exists application_queue_status_category_idx
  on public.application_queue (status, category);

create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  job_post_id uuid references public.job_posts(id) on delete cascade,
  company_name text,
  role text,
  full_name text,
  email text,
  source text,
  created_at timestamptz default now()
);

create table if not exists public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  job_post_id uuid references public.job_posts(id) on delete cascade,
  contact_id uuid references public.outreach_contacts(id) on delete set null,
  subject text,
  body text,
  status text not null default 'DRAFT',
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  sent_at timestamptz
);

create unique index if not exists outreach_drafts_unique_contact_idx
  on public.outreach_drafts (job_seeker_id, job_post_id, contact_id);

create index if not exists outreach_drafts_job_seeker_status_idx
  on public.outreach_drafts (job_seeker_id, status);

create table if not exists public.interview_prep (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  job_post_id uuid references public.job_posts(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (job_seeker_id, job_post_id)
);

create index if not exists interview_prep_job_seeker_idx
  on public.interview_prep (job_seeker_id);
