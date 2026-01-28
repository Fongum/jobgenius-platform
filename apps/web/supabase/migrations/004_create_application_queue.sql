create table if not exists public.application_queue (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid references public.job_posts(id) on delete cascade,
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  status text default 'QUEUED',
  created_at timestamptz default now()
);
