create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED',
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists background_jobs_status_run_at_idx
  on public.background_jobs (status, run_at);

create index if not exists background_jobs_locked_at_idx
  on public.background_jobs (locked_at);

alter table public.background_jobs enable row level security;
