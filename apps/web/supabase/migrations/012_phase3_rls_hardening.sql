drop policy if exists "am_select_apply_run_events" on public.apply_run_events;
drop policy if exists "am_insert_apply_run_events" on public.apply_run_events;

create policy "am_select_apply_run_events"
  on public.apply_run_events
  for select
  using (
    exists (
      select 1
      from public.application_runs runs
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = runs.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where runs.id = apply_run_events.run_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_apply_run_events"
  on public.apply_run_events
  for insert
  with check (
    exists (
      select 1
      from public.application_runs runs
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = runs.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where runs.id = apply_run_events.run_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

alter table public.otp_inbox enable row level security;

create policy "am_select_otp_inbox"
  on public.otp_inbox
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = otp_inbox.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_otp_inbox"
  on public.otp_inbox
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = otp_inbox.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_otp_inbox"
  on public.otp_inbox
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = otp_inbox.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
