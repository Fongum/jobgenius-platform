create table if not exists public.recruiters (
  id uuid primary key default gen_random_uuid(),
  name text,
  title text,
  company text,
  email text,
  linkedin_url text,
  source text,
  confidence_score int not null default 0,
  relationship_score int not null default 0,
  last_contacted_at timestamptz,
  status text not null default 'NEW',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.recruiter_threads (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid references public.recruiters(id) on delete cascade,
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  last_message_direction text,
  last_reply_at timestamptz,
  reply_sentiment_score int,
  thread_status text not null default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (recruiter_id, job_seeker_id)
);

create table if not exists public.outreach_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.outreach_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.outreach_sequences(id) on delete cascade,
  step_number int not null,
  delay_hours int not null,
  template_key text not null,
  subject_template text not null,
  body_template text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (sequence_id, step_number)
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  recruiter_thread_id uuid references public.recruiter_threads(id) on delete cascade,
  sequence_id uuid references public.outreach_sequences(id) on delete set null,
  step_number int,
  direction text not null,
  from_email text not null,
  to_email text not null,
  subject text,
  body text,
  provider text not null default 'stub',
  provider_message_id text,
  status text not null default 'DRAFTED',
  scheduled_for timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists outreach_messages_status_scheduled_idx
  on public.outreach_messages (status, scheduled_for);

create index if not exists outreach_messages_provider_message_idx
  on public.outreach_messages (provider_message_id);

create index if not exists recruiter_threads_status_reply_idx
  on public.recruiter_threads (thread_status, last_reply_at);

create index if not exists recruiters_status_contacted_idx
  on public.recruiters (status, last_contacted_at);

alter table public.recruiters enable row level security;
alter table public.recruiter_threads enable row level security;
alter table public.outreach_sequences enable row level security;
alter table public.outreach_sequence_steps enable row level security;
alter table public.outreach_messages enable row level security;

drop policy if exists "am_select_recruiters" on public.recruiters;
create policy "am_select_recruiters"
  on public.recruiters
  for select
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiters.id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_recruiters" on public.recruiters;
create policy "am_update_recruiters"
  on public.recruiters
  for update
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiters.id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_recruiters" on public.recruiters;
create policy "am_insert_recruiters"
  on public.recruiters
  for insert
  with check (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_recruiter_threads" on public.recruiter_threads;
create policy "am_select_recruiter_threads"
  on public.recruiter_threads
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = recruiter_threads.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_recruiter_threads" on public.recruiter_threads;
create policy "am_insert_recruiter_threads"
  on public.recruiter_threads
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = recruiter_threads.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_recruiter_threads" on public.recruiter_threads;
create policy "am_update_recruiter_threads"
  on public.recruiter_threads
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = recruiter_threads.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_outreach_sequences" on public.outreach_sequences;
create policy "am_select_outreach_sequences"
  on public.outreach_sequences
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_outreach_sequence_steps" on public.outreach_sequence_steps;
create policy "am_select_outreach_sequence_steps"
  on public.outreach_sequence_steps
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_outreach_messages" on public.outreach_messages;
create policy "am_select_outreach_messages"
  on public.outreach_messages
  for select
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_messages.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_outreach_messages" on public.outreach_messages;
create policy "am_insert_outreach_messages"
  on public.outreach_messages
  for insert
  with check (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_messages.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_outreach_messages" on public.outreach_messages;
create policy "am_update_outreach_messages"
  on public.outreach_messages
  for update
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_messages.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
