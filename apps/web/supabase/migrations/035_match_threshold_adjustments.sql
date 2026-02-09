create table if not exists public.match_threshold_adjustments (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  previous_threshold integer not null,
  new_threshold integer not null,
  reason text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists match_threshold_adjustments_job_seeker_idx
  on public.match_threshold_adjustments (job_seeker_id, created_at desc);

alter table public.match_threshold_adjustments enable row level security;

drop policy if exists "service_role_all_threshold_adjustments"
  on public.match_threshold_adjustments;
create policy "service_role_all_threshold_adjustments"
  on public.match_threshold_adjustments
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
