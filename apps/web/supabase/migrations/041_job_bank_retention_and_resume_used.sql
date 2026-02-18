-- 041: Job bank retention + resume used tracking

-- Track when a job post is archived (soft delete)
alter table public.job_posts
  add column if not exists archived_at timestamptz;

create index if not exists job_posts_archived_at_idx
  on public.job_posts (archived_at);

-- Track which resume was used for a run (tailored vs base)
alter table public.application_runs
  add column if not exists resume_url_used text;

alter table public.application_runs
  add column if not exists resume_source text;

create index if not exists application_runs_resume_source_idx
  on public.application_runs (resume_source);
