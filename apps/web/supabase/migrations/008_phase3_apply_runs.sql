alter table public.application_runs
  add column if not exists needs_attention_reason text,
  add column if not exists attempt_count int not null default 0,
  add column if not exists max_retries int not null default 2;

create table if not exists public.apply_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.application_runs(id) on delete cascade,
  ts timestamptz default now(),
  level text not null default 'INFO',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists apply_run_events_run_ts_idx
  on public.apply_run_events (run_id, ts desc);

create index if not exists application_runs_job_seeker_status_created_idx
  on public.application_runs (job_seeker_id, status, created_at desc);

create table if not exists public.apply_error_signatures (
  id uuid primary key default gen_random_uuid(),
  ats_type text,
  url_host text,
  step text,
  error_code text,
  dom_hint text,
  message text,
  created_at timestamptz default now()
);

create index if not exists apply_error_signatures_lookup_idx
  on public.apply_error_signatures (ats_type, error_code);

create table if not exists public.apply_error_suggestions (
  id uuid primary key default gen_random_uuid(),
  ats_type text,
  error_code text,
  suggestion text not null,
  created_at timestamptz default now()
);

create index if not exists apply_error_suggestions_lookup_idx
  on public.apply_error_suggestions (ats_type, error_code);

create or replace view public.attention_inbox as
  select
    runs.id as run_id,
    runs.job_seeker_id,
    runs.job_post_id,
    runs.ats_type,
    runs.status,
    runs.current_step,
    runs.needs_attention_reason,
    runs.last_error,
    runs.last_error_code,
    runs.last_seen_url,
    runs.updated_at,
    posts.title as job_title,
    posts.company as job_company,
    seekers.full_name as job_seeker_name,
    seekers.email as job_seeker_email
  from public.application_runs runs
  left join public.job_posts posts on posts.id = runs.job_post_id
  left join public.job_seekers seekers on seekers.id = runs.job_seeker_id
  where runs.status = 'NEEDS_ATTENTION';

create or replace view public.apply_runs as
  select * from public.application_runs;

create or replace view public.apply_queue_ready as
  select
    queue.id as queue_id,
    queue.job_seeker_id,
    queue.job_post_id,
    queue.status,
    queue.category,
    queue.created_at
  from public.application_queue queue
  where queue.status in ('QUEUED', 'READY');

alter table public.apply_run_events enable row level security;
alter table public.apply_error_signatures enable row level security;
alter table public.apply_error_suggestions enable row level security;

create policy "am_select_apply_run_events"
  on public.apply_run_events
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_apply_run_events"
  on public.apply_run_events
  for insert
  with check (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_apply_error_signatures"
  on public.apply_error_signatures
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_apply_error_signatures"
  on public.apply_error_signatures
  for insert
  with check (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_apply_error_suggestions"
  on public.apply_error_suggestions
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
