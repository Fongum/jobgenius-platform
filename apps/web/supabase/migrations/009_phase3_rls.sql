alter table public.application_runs enable row level security;
alter table public.application_queue enable row level security;
alter table public.job_seekers enable row level security;
alter table public.job_posts enable row level security;
alter table public.job_seeker_assignments enable row level security;
alter table public.job_match_scores enable row level security;
alter table public.job_routing_decisions enable row level security;
alter table public.outreach_contacts enable row level security;
alter table public.outreach_drafts enable row level security;
alter table public.interview_prep enable row level security;

create policy "am_select_job_seekers"
  on public.job_seekers
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_seekers.id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_job_posts"
  on public.job_posts
  for select
  using (true);

create policy "am_select_job_seeker_assignments"
  on public.job_seeker_assignments
  for select
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = job_seeker_assignments.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_job_match_scores"
  on public.job_match_scores
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_match_scores.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_job_routing_decisions"
  on public.job_routing_decisions
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_routing_decisions.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_write_job_routing_decisions"
  on public.job_routing_decisions
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_routing_decisions.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_job_routing_decisions"
  on public.job_routing_decisions
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = job_routing_decisions.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_application_queue"
  on public.application_queue
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = application_queue.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_write_application_queue"
  on public.application_queue
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = application_queue.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_application_queue"
  on public.application_queue
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = application_queue.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_application_runs"
  on public.application_runs
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = application_runs.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_write_application_runs"
  on public.application_runs
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = application_runs.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_application_runs"
  on public.application_runs
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = application_runs.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_outreach_contacts"
  on public.outreach_contacts
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = outreach_contacts.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_write_outreach_contacts"
  on public.outreach_contacts
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = outreach_contacts.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_outreach_drafts"
  on public.outreach_drafts
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = outreach_drafts.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_write_outreach_drafts"
  on public.outreach_drafts
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = outreach_drafts.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_outreach_drafts"
  on public.outreach_drafts
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = outreach_drafts.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_interview_prep"
  on public.interview_prep
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = interview_prep.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_write_interview_prep"
  on public.interview_prep
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = interview_prep.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_interview_prep"
  on public.interview_prep
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = interview_prep.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
