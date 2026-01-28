create table if not exists public.apply_plans (
  run_id uuid primary key references public.application_runs(id) on delete cascade,
  plan jsonb not null,
  version int not null default 1,
  created_at timestamptz default now()
);

alter table public.apply_plans enable row level security;

drop policy if exists "am_select_apply_plans" on public.apply_plans;
create policy "am_select_apply_plans"
  on public.apply_plans
  for select
  using (
    exists (
      select 1
      from public.application_runs runs
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = runs.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where runs.id = apply_plans.run_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_apply_plans" on public.apply_plans;
create policy "am_insert_apply_plans"
  on public.apply_plans
  for insert
  with check (
    exists (
      select 1
      from public.application_runs runs
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = runs.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where runs.id = apply_plans.run_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
