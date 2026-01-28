alter table public.application_step_events enable row level security;
alter table public.attention_items enable row level security;
alter table public.application_events enable row level security;

create policy "am_select_application_step_events"
  on public.application_step_events
  for select
  using (
    exists (
      select 1
      from public.application_runs runs
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = runs.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where runs.id = application_step_events.run_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_application_step_events"
  on public.application_step_events
  for insert
  with check (
    exists (
      select 1
      from public.application_runs runs
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = runs.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where runs.id = application_step_events.run_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_attention_items"
  on public.attention_items
  for select
  using (
    exists (
      select 1
      from public.application_queue queue
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = queue.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where queue.id = attention_items.queue_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_attention_items"
  on public.attention_items
  for update
  using (
    exists (
      select 1
      from public.application_queue queue
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = queue.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where queue.id = attention_items.queue_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_attention_items"
  on public.attention_items
  for insert
  with check (
    exists (
      select 1
      from public.application_queue queue
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = queue.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where queue.id = attention_items.queue_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_application_events"
  on public.application_events
  for select
  using (
    exists (
      select 1
      from public.application_queue queue
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = queue.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where queue.id = application_events.queue_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_application_events"
  on public.application_events
  for insert
  with check (
    exists (
      select 1
      from public.application_queue queue
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = queue.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where queue.id = application_events.queue_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
