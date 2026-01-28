create table if not exists public.application_runs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.application_queue(id) on delete cascade,
  job_seeker_id uuid not null,
  job_post_id uuid not null,
  ats_type text not null,
  status text not null default 'PENDING',
  current_step text not null default 'INIT',
  step_attempts int not null default 0,
  total_attempts int not null default 0,
  max_step_retries int not null default 2,
  last_error text,
  last_error_code text,
  last_seen_url text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists application_runs_job_seeker_status_idx
  on public.application_runs (job_seeker_id, status);

create index if not exists application_runs_queue_id_idx
  on public.application_runs (queue_id);

create table if not exists public.application_step_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.application_runs(id) on delete cascade,
  step text not null,
  event_type text not null,
  message text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists application_step_events_run_created_at_idx
  on public.application_step_events (run_id, created_at desc);

create table if not exists public.otp_inbox (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null,
  channel text not null,
  code text not null,
  received_at timestamptz default now(),
  used_at timestamptz
);
