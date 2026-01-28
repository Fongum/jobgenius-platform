alter table public.application_queue
add column if not exists status text not null default 'QUEUED',
add column if not exists priority int default 0,
add column if not exists attempts int default 0,
add column if not exists last_error text,
add column if not exists locked_by text,
add column if not exists locked_at timestamptz,
add column if not exists updated_at timestamptz default now(),
add column if not exists meta jsonb default '{}'::jsonb;

create index if not exists application_queue_status_created_at_idx
  on public.application_queue (status, created_at);

create index if not exists application_queue_job_seeker_status_idx
  on public.application_queue (job_seeker_id, status);

create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.application_queue(id) on delete cascade,
  event_type text not null,
  message text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.attention_items (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.application_queue(id) on delete cascade,
  assigned_am_id uuid,
  status text not null default 'OPEN',
  reason text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
