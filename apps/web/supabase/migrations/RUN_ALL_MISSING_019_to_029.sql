-- ============================================================================
-- COMBINED CATCH-UP MIGRATION: 019 through 029
-- Run this in the Supabase SQL Editor to apply all missing migrations.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards).
-- ============================================================================

-- ############################################################################
-- MIGRATION 019: Phase 6 Outreach CRM
-- ############################################################################

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
  on public.recruiters for select
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
  on public.recruiters for update
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
  on public.recruiters for insert
  with check (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_recruiter_threads" on public.recruiter_threads;
create policy "am_select_recruiter_threads"
  on public.recruiter_threads for select
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
  on public.recruiter_threads for insert
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
  on public.recruiter_threads for update
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
  on public.outreach_sequences for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_outreach_sequence_steps" on public.outreach_sequence_steps;
create policy "am_select_outreach_sequence_steps"
  on public.outreach_sequence_steps for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_outreach_messages" on public.outreach_messages;
create policy "am_select_outreach_messages"
  on public.outreach_messages for select
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
  on public.outreach_messages for insert
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
  on public.outreach_messages for update
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

-- Service role policies for 019 tables
drop policy if exists "service_role_all_recruiters" on public.recruiters;
create policy "service_role_all_recruiters"
  on public.recruiters for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_recruiter_threads" on public.recruiter_threads;
create policy "service_role_all_recruiter_threads"
  on public.recruiter_threads for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_outreach_sequences" on public.outreach_sequences;
create policy "service_role_all_outreach_sequences"
  on public.outreach_sequences for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_outreach_sequence_steps" on public.outreach_sequence_steps;
create policy "service_role_all_outreach_sequence_steps"
  on public.outreach_sequence_steps for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_outreach_messages" on public.outreach_messages;
create policy "service_role_all_outreach_messages"
  on public.outreach_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- ############################################################################
-- MIGRATION 020: Fix recruiter_threads job_seeker_id column
-- ############################################################################

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recruiter_threads'
      and column_name = 'jobseeker_id'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recruiter_threads'
        and column_name = 'job_seeker_id'
    ) then
      execute 'update public.recruiter_threads set job_seeker_id = coalesce(job_seeker_id, jobseeker_id)';
      execute 'alter table public.recruiter_threads drop column jobseeker_id';
    else
      execute 'alter table public.recruiter_threads rename column jobseeker_id to job_seeker_id';
    end if;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.constraint_schema = 'public'
      and tc.table_name = 'recruiter_threads'
      and tc.constraint_type = 'FOREIGN KEY'
      and tc.constraint_name = 'recruiter_threads_job_seeker_id_fkey'
  ) then
    begin
      execute 'alter table public.recruiter_threads drop constraint if exists recruiter_threads_jobseeker_id_fkey';
      execute 'alter table public.recruiter_threads add constraint recruiter_threads_job_seeker_id_fkey foreign key (job_seeker_id) references public.job_seekers(id) on delete cascade';
    exception when others then
      null;
    end;
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'recruiter_threads'
      and indexname = 'recruiter_threads_recruiter_id_jobseeker_id_key'
  ) then
    execute 'drop index if exists public.recruiter_threads_recruiter_id_jobseeker_id_key';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'recruiter_threads'
      and indexname = 'recruiter_threads_recruiter_id_job_seeker_id_key'
  ) then
    begin
      execute 'alter table public.recruiter_threads add constraint recruiter_threads_recruiter_id_job_seeker_id_key unique (recruiter_id, job_seeker_id)';
    exception when others then
      null;
    end;
  end if;
end $$;


-- ############################################################################
-- MIGRATION 021: Interview Scheduling & Email Logging
-- ############################################################################

-- interview_slots
create table if not exists public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  job_post_id uuid references public.job_posts(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_min int not null default 30 check (duration_min in (30, 45, 60)),
  is_booked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_slots_end_after_start check (end_at > start_at)
);

create index if not exists interview_slots_am_start_available_idx
  on public.interview_slots (account_manager_id, start_at)
  where (is_booked = false);

-- interviews (THE MISSING TABLE)
do $$ begin
  create type public.interview_type as enum ('phone', 'video', 'in_person');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.interview_status as enum (
    'pending_candidate', 'confirmed', 'completed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_queue_id uuid references public.application_queue(id) on delete set null,
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  scheduled_at timestamptz,
  duration_min int not null default 30,
  interview_type public.interview_type not null default 'video',
  meeting_link text,
  phone_number text,
  address text,
  status public.interview_status not null default 'pending_candidate',
  notes_for_candidate text,
  notes_internal text,
  candidate_token text unique not null default encode(gen_random_bytes(32), 'hex'),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('recruiter', 'candidate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interviews_am_status_idx
  on public.interviews (account_manager_id, status);

create index if not exists interviews_seeker_status_idx
  on public.interviews (job_seeker_id, status);

create index if not exists interviews_scheduled_at_idx
  on public.interviews (scheduled_at);

create index if not exists interviews_candidate_token_idx
  on public.interviews (candidate_token);

-- interview_slot_offers
create table if not exists public.interview_slot_offers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  slot_id uuid not null references public.interview_slots(id) on delete cascade,
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (interview_id, slot_id)
);

-- email_logs
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  from_email text not null,
  subject text not null,
  template_key text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'bounced')),
  provider text not null default 'resend',
  provider_message_id text,
  error_detail text,
  job_seeker_id uuid references public.job_seekers(id) on delete set null,
  job_post_id uuid references public.job_posts(id) on delete set null,
  interview_id uuid references public.interviews(id) on delete set null,
  application_queue_id uuid references public.application_queue(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_logs_template_created_idx
  on public.email_logs (template_key, created_at);

create index if not exists email_logs_to_created_idx
  on public.email_logs (to_email, created_at);

-- book_interview_slot function
create or replace function public.book_interview_slot(
  p_slot_id uuid,
  p_interview_id uuid
) returns boolean
language plpgsql
security definer
as $$
declare
  v_slot record;
  v_now timestamptz := now();
begin
  select * into v_slot
  from public.interview_slots
  where id = p_slot_id
  for update;

  if not found then return false; end if;
  if v_slot.is_booked then return false; end if;

  update public.interview_slots
  set is_booked = true, updated_at = v_now
  where id = p_slot_id;

  update public.interview_slot_offers
  set is_selected = true
  where interview_id = p_interview_id
    and slot_id = p_slot_id;

  update public.interviews
  set status = 'confirmed',
      scheduled_at = v_slot.start_at,
      confirmed_at = v_now,
      updated_at = v_now
  where id = p_interview_id
    and status = 'pending_candidate';

  return true;
end;
$$;

-- RLS for 021 tables
alter table public.interview_slots enable row level security;

drop policy if exists "am_crud_own_slots" on public.interview_slots;
create policy "am_crud_own_slots"
  on public.interview_slots for all
  using (
    exists (
      select 1 from public.account_managers
      where id = interview_slots.account_manager_id
        and email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "service_role_all_slots" on public.interview_slots;
create policy "service_role_all_slots"
  on public.interview_slots for all
  using (auth.role() = 'service_role');

alter table public.interviews enable row level security;

drop policy if exists "am_manage_interviews" on public.interviews;
create policy "am_manage_interviews"
  on public.interviews for all
  using (
    exists (
      select 1 from public.account_managers
      where id = interviews.account_manager_id
        and email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "service_role_all_interviews" on public.interviews;
create policy "service_role_all_interviews"
  on public.interviews for all
  using (auth.role() = 'service_role');

alter table public.interview_slot_offers enable row level security;

drop policy if exists "am_manage_slot_offers" on public.interview_slot_offers;
create policy "am_manage_slot_offers"
  on public.interview_slot_offers for all
  using (
    exists (
      select 1 from public.interviews i
      join public.account_managers am on am.id = i.account_manager_id
      where i.id = interview_slot_offers.interview_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "service_role_all_slot_offers" on public.interview_slot_offers;
create policy "service_role_all_slot_offers"
  on public.interview_slot_offers for all
  using (auth.role() = 'service_role');

alter table public.email_logs enable row level security;

drop policy if exists "am_select_email_logs" on public.email_logs;
create policy "am_select_email_logs"
  on public.email_logs for select
  using (
    exists (
      select 1 from public.job_seeker_assignments a
      join public.account_managers am on am.id = a.account_manager_id
      where a.job_seeker_id = email_logs.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "service_role_all_email_logs" on public.email_logs;
create policy "service_role_all_email_logs"
  on public.email_logs for all
  using (auth.role() = 'service_role');


-- ############################################################################
-- MIGRATION 022: Phase 6 Completion Architecture
-- ############################################################################

alter table public.recruiter_threads
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists ghosting_risk_score int not null default 0,
  add column if not exists interview_started_at timestamptz,
  add column if not exists offer_received_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason text;

alter table public.outreach_messages
  add column if not exists open_tracking_token text,
  add column if not exists follow_up_tone text;

create unique index if not exists outreach_messages_open_tracking_token_uidx
  on public.outreach_messages (open_tracking_token)
  where open_tracking_token is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recruiters_status_phase6_check'
  ) then
    alter table public.recruiters
      add constraint recruiters_status_phase6_check
      check (status in ('NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING', 'CLOSED'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recruiter_threads_status_phase6_check'
  ) then
    alter table public.recruiter_threads
      add constraint recruiter_threads_status_phase6_check
      check (thread_status in ('ACTIVE', 'WAITING_REPLY', 'FOLLOW_UP_DUE', 'CLOSED'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outreach_messages_status_phase6_check'
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_status_phase6_check
      check (
        status in (
          'DRAFTED', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED',
          'REPLIED', 'FOLLOWUP_DUE', 'BOUNCED', 'FAILED', 'OPTED_OUT', 'CLOSED'
        )
      )
      not valid;
  end if;
end $$;

alter table public.outreach_sequence_steps
  add column if not exists delay_days int,
  add column if not exists template_type text;

update public.outreach_sequence_steps
set delay_days = case
  when delay_hours <= 0 then 0
  else ceil(delay_hours::numeric / 24.0)::int
end
where delay_days is null;

update public.outreach_sequence_steps
set template_type = case
  when step_number = 1 then 'INITIAL'
  when step_number = 2 then 'FOLLOWUP_1'
  else 'FOLLOWUP_2'
end
where template_type is null;

alter table public.outreach_sequence_steps
  alter column delay_days set default 0;

alter table public.outreach_sequence_steps
  alter column template_type set default 'INITIAL';

create table if not exists public.outreach_plans (
  id uuid primary key default gen_random_uuid(),
  recruiter_thread_id uuid not null references public.recruiter_threads(id) on delete cascade unique,
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  sequence_id uuid references public.outreach_sequences(id) on delete set null,
  recruiter_type text,
  preferred_tone text not null default 'CONCISE',
  company_signal text,
  personalization jsonb not null default '{}'::jsonb,
  ghosting_risk_score int not null default 0,
  next_action text not null default 'SEND_INITIAL',
  plan_version text not null default 'v1',
  generated_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists outreach_plans_thread_idx
  on public.outreach_plans (recruiter_thread_id);

create index if not exists outreach_plans_risk_idx
  on public.outreach_plans (ghosting_risk_score, next_action);

create table if not exists public.recruiter_opt_outs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  recruiter_thread_id uuid references public.recruiter_threads(id) on delete set null,
  email text,
  source text not null default 'webhook',
  reason text,
  opted_out_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique (recruiter_id)
);

create index if not exists recruiter_opt_outs_thread_idx
  on public.recruiter_opt_outs (recruiter_thread_id);

alter table public.outreach_plans enable row level security;
alter table public.recruiter_opt_outs enable row level security;

drop policy if exists "am_select_outreach_plans" on public.outreach_plans;
create policy "am_select_outreach_plans"
  on public.outreach_plans for select
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_plans.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_outreach_plans" on public.outreach_plans;
create policy "am_insert_outreach_plans"
  on public.outreach_plans for insert
  with check (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_plans.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_outreach_plans" on public.outreach_plans;
create policy "am_update_outreach_plans"
  on public.outreach_plans for update
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_plans.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "am_select_recruiter_opt_outs"
  on public.recruiter_opt_outs for select
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiter_opt_outs.recruiter_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "am_insert_recruiter_opt_outs"
  on public.recruiter_opt_outs for insert
  with check (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiter_opt_outs.recruiter_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "am_update_recruiter_opt_outs"
  on public.recruiter_opt_outs for update
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiter_opt_outs.recruiter_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- Service role for 022 tables
drop policy if exists "service_role_all_outreach_plans" on public.outreach_plans;
create policy "service_role_all_outreach_plans"
  on public.outreach_plans for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "service_role_all_recruiter_opt_outs"
  on public.recruiter_opt_outs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Views (022)
create or replace view public.v_outreach_am_metrics as
  with thread_rollup as (
    select
      assignments.account_manager_id,
      threads.id as recruiter_thread_id,
      threads.recruiter_id,
      threads.reply_sentiment_score,
      threads.interview_started_at,
      threads.offer_received_at,
      threads.closed_at,
      threads.ghosting_risk_score,
      recruiters.status as recruiter_status,
      recruiters.last_contacted_at,
      min(messages.sent_at) filter (
        where messages.direction = 'OUTBOUND' and messages.sent_at is not null
      ) as first_outbound_sent_at,
      max(case when messages.status = 'REPLIED' then 1 else 0 end) as has_reply,
      max(case when messages.status = 'BOUNCED' then 1 else 0 end) as has_bounce
    from public.recruiter_threads threads
    join public.job_seeker_assignments assignments
      on assignments.job_seeker_id = threads.job_seeker_id
    left join public.recruiters recruiters
      on recruiters.id = threads.recruiter_id
    left join public.outreach_messages messages
      on messages.recruiter_thread_id = threads.id
    group by
      assignments.account_manager_id,
      threads.id, threads.recruiter_id,
      threads.reply_sentiment_score,
      threads.interview_started_at,
      threads.offer_received_at,
      threads.closed_at,
      threads.ghosting_risk_score,
      recruiters.status,
      recruiters.last_contacted_at
  )
  select
    account_manager_id,
    count(distinct recruiter_id) filter (where last_contacted_at is not null) as recruiters_contacted,
    count(*) as threads_total,
    count(*) filter (where has_reply = 1) as replied_threads,
    case when count(*) filter (where last_contacted_at is not null) > 0
      then round((count(*) filter (where has_reply = 1))::numeric / nullif(count(*) filter (where last_contacted_at is not null), 0), 3)
      else 0
    end as reply_rate,
    count(*) filter (where has_reply = 1 and coalesce(reply_sentiment_score, 0) >= 20) as positive_replies,
    case when count(*) filter (where has_reply = 1) > 0
      then round((count(*) filter (where has_reply = 1 and coalesce(reply_sentiment_score, 0) >= 20))::numeric / nullif(count(*) filter (where has_reply = 1), 0), 3)
      else 0
    end as positive_reply_pct,
    count(*) filter (where recruiter_status = 'INTERVIEWING' or interview_started_at is not null) as interviewing_threads,
    case when count(*) filter (where last_contacted_at is not null) > 0
      then round((count(*) filter (where recruiter_status = 'INTERVIEWING' or interview_started_at is not null))::numeric / nullif(count(*) filter (where last_contacted_at is not null), 0), 3)
      else 0
    end as interview_conversion_rate,
    count(*) filter (where offer_received_at is not null) as offer_threads,
    case when count(*) filter (where offer_received_at is not null and first_outbound_sent_at is not null) > 0
      then round(avg(extract(epoch from (offer_received_at - first_outbound_sent_at)) / 3600) filter (where offer_received_at is not null and first_outbound_sent_at is not null)::numeric, 1)
      else null
    end as avg_hours_to_offer,
    round(avg(ghosting_risk_score)::numeric, 2) as avg_ghosting_risk
  from thread_rollup
  group by account_manager_id;

create or replace view public.v_outreach_pipeline_status as
  select
    assignments.account_manager_id,
    recruiters.status,
    count(*) as recruiter_count
  from public.recruiter_threads threads
  join public.job_seeker_assignments assignments
    on assignments.job_seeker_id = threads.job_seeker_id
  join public.recruiters recruiters
    on recruiters.id = threads.recruiter_id
  group by assignments.account_manager_id, recruiters.status;

-- Seed default sequence (022)
do $$
declare
  default_sequence_id uuid;
begin
  select id into default_sequence_id
  from public.outreach_sequences
  where is_active = true
  order by created_at asc limit 1;

  if default_sequence_id is null then
    insert into public.outreach_sequences (name, is_active)
    values ('Default Recruiter Sequence', true)
    returning id into default_sequence_id;
  end if;

  insert into public.outreach_sequence_steps (
    sequence_id, step_number, delay_hours, delay_days,
    template_key, template_type, subject_template, body_template
  )
  values
    (default_sequence_id, 1, 0, 0, 'INITIAL', 'INITIAL',
     'Introduction from JobGenius',
     'Hi {{recruiter_name}},\n\nI am reaching out from JobGenius with a candidate profile that aligns with your open roles.\n\nIf useful, I can share a concise summary and coordinate next steps.\n\nThanks,\nJobGenius AM'),
    (default_sequence_id, 2, 72, 3, 'FOLLOWUP_1', 'FOLLOWUP_1',
     'Quick follow-up',
     'Hi {{recruiter_name}},\n\nQuick follow-up in case this got buried. I can send a short candidate summary tailored to {{company_name}} hiring needs.\n\nThanks,\nJobGenius AM'),
    (default_sequence_id, 3, 144, 6, 'FOLLOWUP_2', 'FOLLOWUP_2',
     'Final follow-up',
     'Hi {{recruiter_name}},\n\nFinal follow-up from my side. If this is not the right contact, a quick redirect would be very helpful.\n\nBest,\nJobGenius AM')
  on conflict (sequence_id, step_number) do update set
    delay_hours = excluded.delay_hours,
    delay_days = excluded.delay_days,
    template_key = excluded.template_key,
    template_type = excluded.template_type,
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    updated_at = now();
end $$;


-- ############################################################################
-- MIGRATION 023: Intelligent Matching
-- ############################################################################

alter table public.job_seekers
  add column if not exists preferred_industries text[] default '{}';
alter table public.job_seekers
  add column if not exists preferred_company_sizes text[] default '{}';
alter table public.job_seekers
  add column if not exists exclude_keywords text[] default '{}';
alter table public.job_seekers
  add column if not exists years_experience integer;
alter table public.job_seekers
  add column if not exists preferred_locations text[] default '{}';
alter table public.job_seekers
  add column if not exists open_to_relocation boolean default false;
alter table public.job_seekers
  add column if not exists requires_visa_sponsorship boolean default false;

alter table public.job_posts
  add column if not exists salary_min integer;
alter table public.job_posts
  add column if not exists salary_max integer;
alter table public.job_posts
  add column if not exists seniority_level text;
alter table public.job_posts
  add column if not exists work_type text;
alter table public.job_posts
  add column if not exists years_experience_min integer;
alter table public.job_posts
  add column if not exists years_experience_max integer;
alter table public.job_posts
  add column if not exists required_skills text[] default '{}';
alter table public.job_posts
  add column if not exists preferred_skills text[] default '{}';
alter table public.job_posts
  add column if not exists industry text;
alter table public.job_posts
  add column if not exists company_size text;
alter table public.job_posts
  add column if not exists offers_visa_sponsorship boolean;
alter table public.job_posts
  add column if not exists employment_type text;
alter table public.job_posts
  add column if not exists parsed_at timestamptz;

alter table public.job_match_scores
  add column if not exists confidence text;
alter table public.job_match_scores
  add column if not exists recommendation text;

create index if not exists job_posts_parsed_at_idx
  on public.job_posts (parsed_at) where parsed_at is null;
create index if not exists job_posts_industry_idx
  on public.job_posts (industry) where industry is not null;
create index if not exists job_seekers_industries_idx
  on public.job_seekers using gin (preferred_industries)
  where preferred_industries != '{}';


-- ############################################################################
-- MIGRATION 024: Job Discovery
-- ############################################################################

create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  enabled boolean default true,
  rate_limit_per_minute integer default 10,
  requires_auth boolean default false,
  auth_config jsonb default '{}'::jsonb,
  selectors jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.job_discovery_searches (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  source_id uuid references public.job_sources(id) on delete cascade,
  search_name text not null,
  search_url text not null,
  keywords text[] default '{}',
  location text,
  filters jsonb default '{}'::jsonb,
  enabled boolean default true,
  last_run_at timestamptz,
  last_job_count integer default 0,
  run_frequency_hours integer default 24,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.job_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  search_id uuid references public.job_discovery_searches(id) on delete cascade,
  source_name text not null,
  status text not null default 'PENDING',
  jobs_found integer default 0,
  jobs_new integer default 0,
  jobs_updated integer default 0,
  pages_scraped integer default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.job_posts
  add column if not exists external_id text;
alter table public.job_posts
  add column if not exists source_name text;
alter table public.job_posts
  add column if not exists discovery_run_id uuid references public.job_discovery_runs(id) on delete set null;
alter table public.job_posts
  add column if not exists discovered_at timestamptz;
alter table public.job_posts
  add column if not exists last_seen_at timestamptz;
alter table public.job_posts
  add column if not exists posted_at timestamptz;
alter table public.job_posts
  add column if not exists is_active boolean default true;

create index if not exists job_posts_external_id_idx
  on public.job_posts (external_id) where external_id is not null;
create index if not exists job_posts_source_name_idx
  on public.job_posts (source_name) where source_name is not null;
create index if not exists job_posts_last_seen_idx
  on public.job_posts (last_seen_at) where last_seen_at is not null;
create index if not exists job_discovery_searches_next_run_idx
  on public.job_discovery_searches (last_run_at, enabled) where enabled = true;
create index if not exists job_discovery_runs_search_idx
  on public.job_discovery_runs (search_id, created_at desc);

alter table public.job_sources enable row level security;
alter table public.job_discovery_searches enable row level security;
alter table public.job_discovery_runs enable row level security;

drop policy if exists "am_select_job_sources" on public.job_sources;
create policy "am_select_job_sources"
  on public.job_sources for select
  using (exists (select 1 from public.account_managers where email = coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "am_select_discovery_searches" on public.job_discovery_searches;
create policy "am_select_discovery_searches"
  on public.job_discovery_searches for select
  using (exists (
    select 1 from public.job_seeker_assignments a
    join public.account_managers am on am.id = a.account_manager_id
    where a.job_seeker_id = job_discovery_searches.job_seeker_id
      and am.email = coalesce(auth.jwt() ->> 'email', '')
  ));

drop policy if exists "am_insert_discovery_searches" on public.job_discovery_searches;
create policy "am_insert_discovery_searches"
  on public.job_discovery_searches for insert
  with check (exists (
    select 1 from public.job_seeker_assignments a
    join public.account_managers am on am.id = a.account_manager_id
    where a.job_seeker_id = job_discovery_searches.job_seeker_id
      and am.email = coalesce(auth.jwt() ->> 'email', '')
  ));

drop policy if exists "am_update_discovery_searches" on public.job_discovery_searches;
create policy "am_update_discovery_searches"
  on public.job_discovery_searches for update
  using (exists (
    select 1 from public.job_seeker_assignments a
    join public.account_managers am on am.id = a.account_manager_id
    where a.job_seeker_id = job_discovery_searches.job_seeker_id
      and am.email = coalesce(auth.jwt() ->> 'email', '')
  ));

drop policy if exists "am_delete_discovery_searches" on public.job_discovery_searches;
create policy "am_delete_discovery_searches"
  on public.job_discovery_searches for delete
  using (exists (
    select 1 from public.job_seeker_assignments a
    join public.account_managers am on am.id = a.account_manager_id
    where a.job_seeker_id = job_discovery_searches.job_seeker_id
      and am.email = coalesce(auth.jwt() ->> 'email', '')
  ));

drop policy if exists "am_select_discovery_runs" on public.job_discovery_runs;
create policy "am_select_discovery_runs"
  on public.job_discovery_runs for select
  using (exists (
    select 1
    from public.job_discovery_searches s
    join public.job_seeker_assignments a on a.job_seeker_id = s.job_seeker_id
    join public.account_managers am on am.id = a.account_manager_id
    where s.id = job_discovery_runs.search_id
      and am.email = coalesce(auth.jwt() ->> 'email', '')
  ));

-- Service role for 024 tables
drop policy if exists "service_role_all_job_sources" on public.job_sources;
create policy "service_role_all_job_sources"
  on public.job_sources for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_discovery_searches" on public.job_discovery_searches;
create policy "service_role_all_discovery_searches"
  on public.job_discovery_searches for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_discovery_runs" on public.job_discovery_runs;
create policy "service_role_all_discovery_runs"
  on public.job_discovery_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Seed job sources (024)
insert into public.job_sources (name, base_url, rate_limit_per_minute, requires_auth, selectors) values
  ('linkedin', 'https://www.linkedin.com/jobs/search', 5, false, '{"job_cards": ".jobs-search__results-list > li", "job_title": ".base-search-card__title", "job_company": ".base-search-card__subtitle", "job_location": ".job-search-card__location", "job_link": ".base-card__full-link", "job_id_attr": "data-entity-urn", "next_page": "button[aria-label=\"See more jobs\"]", "load_more_type": "infinite_scroll"}'::jsonb),
  ('indeed', 'https://www.indeed.com/jobs', 10, false, '{"job_cards": ".job_seen_beacon, .resultContent", "job_title": ".jobTitle span[title], h2.jobTitle", "job_company": "[data-testid=\"company-name\"], .companyName", "job_location": "[data-testid=\"text-location\"], .companyLocation", "job_link": ".jcs-JobTitle", "job_id_attr": "data-jk", "next_page": "[data-testid=\"pagination-page-next\"]", "load_more_type": "pagination"}'::jsonb),
  ('glassdoor', 'https://www.glassdoor.com/Job', 5, false, '{"job_cards": "[data-test=\"jobListing\"]", "job_title": "[data-test=\"job-title\"]", "job_company": "[data-test=\"employer-name\"]", "job_location": "[data-test=\"emp-location\"]", "job_link": "[data-test=\"job-title\"]", "job_id_attr": "data-id", "next_page": "[data-test=\"pagination-next\"]", "load_more_type": "pagination"}'::jsonb)
on conflict (name) do nothing;


-- ############################################################################
-- MIGRATION 025: Authentication (skip if already applied)
-- ############################################################################

alter table public.account_managers
  add column if not exists auth_id uuid unique;
alter table public.account_managers
  add column if not exists role text default 'am';
alter table public.account_managers
  add column if not exists last_login_at timestamptz;

alter table public.job_seekers
  add column if not exists auth_id uuid unique;
alter table public.job_seekers
  add column if not exists last_login_at timestamptz;


-- ############################################################################
-- MIGRATION 026: Job Seeker Portal
-- ############################################################################

alter table public.job_seekers
  add column if not exists phone text,
  add column if not exists linkedin_url text,
  add column if not exists portfolio_url text,
  add column if not exists address_line1 text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists address_country text,
  add column if not exists education jsonb default '[]',
  add column if not exists work_history jsonb default '[]',
  add column if not exists profile_completion int default 0,
  add column if not exists xp_points int default 0,
  add column if not exists achievements jsonb default '[]';

create table if not exists public.job_seeker_references (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  name text not null,
  title text,
  company text,
  email text,
  phone text,
  relationship text check (relationship in ('manager', 'colleague', 'mentor', 'other')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_job_seeker_references_seeker
  on public.job_seeker_references(job_seeker_id);

create table if not exists public.job_seeker_answers (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  answer text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(job_seeker_id, question_key)
);

create index if not exists idx_job_seeker_answers_seeker
  on public.job_seeker_answers(job_seeker_id);

create table if not exists public.job_seeker_documents (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  doc_type text not null check (doc_type in ('resume', 'cover_letter', 'portfolio', 'other')),
  file_name text not null,
  file_url text not null,
  uploaded_at timestamptz default now(),
  parsed_data jsonb
);

create index if not exists idx_job_seeker_documents_seeker
  on public.job_seeker_documents(job_seeker_id);

-- RLS for 026 tables
alter table public.job_seeker_references enable row level security;

drop policy if exists "service_role full access on job_seeker_references" on public.job_seeker_references;
create policy "service_role full access on job_seeker_references"
  on public.job_seeker_references for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

drop policy if exists "job seekers manage own references" on public.job_seeker_references;
create policy "job seekers manage own references"
  on public.job_seeker_references for all
  using (job_seeker_id = auth.uid()::uuid)
  with check (job_seeker_id = auth.uid()::uuid);

alter table public.job_seeker_answers enable row level security;

drop policy if exists "service_role full access on job_seeker_answers" on public.job_seeker_answers;
create policy "service_role full access on job_seeker_answers"
  on public.job_seeker_answers for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

drop policy if exists "job seekers manage own answers" on public.job_seeker_answers;
create policy "job seekers manage own answers"
  on public.job_seeker_answers for all
  using (job_seeker_id = auth.uid()::uuid)
  with check (job_seeker_id = auth.uid()::uuid);

alter table public.job_seeker_documents enable row level security;

drop policy if exists "service_role full access on job_seeker_documents" on public.job_seeker_documents;
create policy "service_role full access on job_seeker_documents"
  on public.job_seeker_documents for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

drop policy if exists "job seekers manage own documents" on public.job_seeker_documents;
create policy "job seekers manage own documents"
  on public.job_seeker_documents for all
  using (job_seeker_id = auth.uid()::uuid)
  with check (job_seeker_id = auth.uid()::uuid);

-- Storage bucket for resumes
insert into storage.buckets (id, name, public)
  values ('resumes', 'resumes', false)
  on conflict (id) do nothing;


-- ############################################################################
-- MIGRATION 027: AM Approval Workflow
-- ############################################################################

alter table public.account_managers
  add column if not exists status text default 'pending';
alter table public.account_managers
  add column if not exists am_code text unique;

create index if not exists account_managers_am_code_idx
  on public.account_managers (am_code) where am_code is not null;
create index if not exists account_managers_status_idx
  on public.account_managers (status);

create or replace function public.generate_am_code()
returns text as $$
declare
  new_code text;
  code_exists boolean;
begin
  loop
    new_code := 'AM-' || upper(substring(md5(random()::text) from 1 for 4));
    select exists(select 1 from public.account_managers where am_code = new_code) into code_exists;
    exit when not code_exists;
  end loop;
  return new_code;
end;
$$ language plpgsql;

create or replace function public.set_am_code()
returns trigger as $$
begin
  if new.am_code is null then
    new.am_code := public.generate_am_code();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_set_am_code on public.account_managers;

create trigger trigger_set_am_code
  before insert on public.account_managers
  for each row
  execute function public.set_am_code();

-- Generate codes for existing accounts
update public.account_managers
set am_code = public.generate_am_code()
where am_code is null;

-- Grandfather existing accounts as approved
update public.account_managers
set status = 'approved'
where status is null or status = 'pending';

-- Extension sessions table
create table if not exists public.extension_sessions (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  token_hash text not null unique,
  active_job_seeker_id uuid references public.job_seekers(id) on delete set null,
  expires_at timestamptz not null,
  last_active_at timestamptz default now(),
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists extension_sessions_am_idx
  on public.extension_sessions (account_manager_id);
create index if not exists extension_sessions_token_idx
  on public.extension_sessions (token_hash);
create index if not exists extension_sessions_expires_idx
  on public.extension_sessions (expires_at);

alter table public.extension_sessions enable row level security;

drop policy if exists "service_role_all_extension_sessions" on public.extension_sessions;
create policy "service_role_all_extension_sessions"
  on public.extension_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- ############################################################################
-- MIGRATION 028: Portal Enhancement
-- ############################################################################

do $$ begin
  create type public.conversation_type as enum ('general', 'application_question');
exception when duplicate_object then null;
end $$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  conversation_type public.conversation_type not null default 'general',
  subject text not null,
  job_post_id uuid references public.job_posts(id) on delete set null,
  application_queue_id uuid references public.application_queue(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_seeker_idx
  on public.conversations (job_seeker_id, updated_at desc);
create index if not exists conversations_am_idx
  on public.conversations (account_manager_id, updated_at desc);
create index if not exists conversations_type_idx
  on public.conversations (conversation_type);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('job_seeker', 'account_manager', 'system')),
  sender_id uuid not null,
  content text not null,
  is_answer boolean not null default false,
  attachments jsonb default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conv_idx
  on public.conversation_messages (conversation_id, created_at asc);
create index if not exists conversation_messages_unread_idx
  on public.conversation_messages (conversation_id) where read_at is null;

create table if not exists public.application_question_answers (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  question text not null,
  answer text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.conversation_messages(id) on delete set null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_question_answers_seeker_idx
  on public.application_question_answers (job_seeker_id, is_active) where is_active = true;
create index if not exists app_question_answers_category_idx
  on public.application_question_answers (job_seeker_id, category) where is_active = true;

create table if not exists public.interview_prep_videos (
  id uuid primary key default gen_random_uuid(),
  interview_prep_id uuid not null references public.interview_prep(id) on delete cascade,
  title text not null,
  url text not null,
  source text,
  thumbnail_url text,
  duration_seconds integer,
  description text,
  category text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists interview_prep_videos_prep_idx
  on public.interview_prep_videos (interview_prep_id, sort_order);

do $$ begin
  create type public.practice_session_status as enum ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null;
end $$;

create table if not exists public.interview_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  interview_prep_id uuid not null references public.interview_prep(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  session_type text not null default 'qa' check (session_type in ('qa', 'audio_simulation')),
  status public.practice_session_status not null default 'not_started',
  questions jsonb not null default '[]'::jsonb,
  audio_recording_url text,
  overall_score integer check (overall_score >= 0 and overall_score <= 100),
  feedback jsonb default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists practice_sessions_seeker_idx
  on public.interview_practice_sessions (job_seeker_id, created_at desc);
create index if not exists practice_sessions_prep_idx
  on public.interview_practice_sessions (interview_prep_id);

-- interview_results (depends on interviews table from 021)
create table if not exists public.interview_results (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade unique,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  outcome text not null check (outcome in ('passed', 'failed', 'pending', 'advanced', 'offer', 'rejected')),
  interviewer_feedback text,
  internal_rating integer check (internal_rating >= 1 and internal_rating <= 5),
  stage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interview_results_seeker_idx
  on public.interview_results (job_seeker_id, created_at desc);
create index if not exists interview_results_outcome_idx
  on public.interview_results (outcome);

-- RLS for 028 tables
alter table public.conversations enable row level security;

drop policy if exists "service_role_all_conversations" on public.conversations;
create policy "service_role_all_conversations"
  on public.conversations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "job_seeker_select_own_conversations" on public.conversations;
create policy "job_seeker_select_own_conversations"
  on public.conversations for select
  using (job_seeker_id in (select id from public.job_seekers where auth_id = auth.uid()));

drop policy if exists "am_manage_assigned_conversations" on public.conversations;
create policy "am_manage_assigned_conversations"
  on public.conversations for all
  using (account_manager_id in (select id from public.account_managers where auth_id = auth.uid()))
  with check (account_manager_id in (select id from public.account_managers where auth_id = auth.uid()));

alter table public.conversation_messages enable row level security;

drop policy if exists "service_role_all_conversation_messages" on public.conversation_messages;
create policy "service_role_all_conversation_messages"
  on public.conversation_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "job_seeker_select_own_messages" on public.conversation_messages;
create policy "job_seeker_select_own_messages"
  on public.conversation_messages for select
  using (conversation_id in (
    select c.id from public.conversations c
    join public.job_seekers js on js.id = c.job_seeker_id
    where js.auth_id = auth.uid()
  ));

drop policy if exists "job_seeker_insert_own_messages" on public.conversation_messages;
create policy "job_seeker_insert_own_messages"
  on public.conversation_messages for insert
  with check (conversation_id in (
    select c.id from public.conversations c
    join public.job_seekers js on js.id = c.job_seeker_id
    where js.auth_id = auth.uid()
  ));

drop policy if exists "job_seeker_update_own_messages" on public.conversation_messages;
create policy "job_seeker_update_own_messages"
  on public.conversation_messages for update
  using (conversation_id in (
    select c.id from public.conversations c
    join public.job_seekers js on js.id = c.job_seeker_id
    where js.auth_id = auth.uid()
  ));

drop policy if exists "am_manage_assigned_messages" on public.conversation_messages;
create policy "am_manage_assigned_messages"
  on public.conversation_messages for all
  using (conversation_id in (
    select c.id from public.conversations c
    join public.account_managers am on am.id = c.account_manager_id
    where am.auth_id = auth.uid()
  ))
  with check (conversation_id in (
    select c.id from public.conversations c
    join public.account_managers am on am.id = c.account_manager_id
    where am.auth_id = auth.uid()
  ));

alter table public.application_question_answers enable row level security;

drop policy if exists "service_role_all_app_answers" on public.application_question_answers;
create policy "service_role_all_app_answers"
  on public.application_question_answers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "job_seeker_manage_own_answers" on public.application_question_answers;
create policy "job_seeker_manage_own_answers"
  on public.application_question_answers for all
  using (job_seeker_id in (select id from public.job_seekers where auth_id = auth.uid()))
  with check (job_seeker_id in (select id from public.job_seekers where auth_id = auth.uid()));

drop policy if exists "am_select_assigned_answers" on public.application_question_answers;
create policy "am_select_assigned_answers"
  on public.application_question_answers for select
  using (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

alter table public.interview_prep_videos enable row level security;

drop policy if exists "service_role_all_prep_videos" on public.interview_prep_videos;
create policy "service_role_all_prep_videos"
  on public.interview_prep_videos for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "job_seeker_select_own_prep_videos" on public.interview_prep_videos;
create policy "job_seeker_select_own_prep_videos"
  on public.interview_prep_videos for select
  using (interview_prep_id in (
    select ip.id from public.interview_prep ip
    join public.job_seekers js on js.id = ip.job_seeker_id
    where js.auth_id = auth.uid()
  ));

drop policy if exists "am_manage_prep_videos" on public.interview_prep_videos;
create policy "am_manage_prep_videos"
  on public.interview_prep_videos for all
  using (interview_prep_id in (
    select ip.id from public.interview_prep ip
    join public.job_seeker_assignments jsa on jsa.job_seeker_id = ip.job_seeker_id
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ))
  with check (interview_prep_id in (
    select ip.id from public.interview_prep ip
    join public.job_seeker_assignments jsa on jsa.job_seeker_id = ip.job_seeker_id
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

alter table public.interview_practice_sessions enable row level security;

drop policy if exists "service_role_all_practice_sessions" on public.interview_practice_sessions;
create policy "service_role_all_practice_sessions"
  on public.interview_practice_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "job_seeker_manage_own_practice" on public.interview_practice_sessions;
create policy "job_seeker_manage_own_practice"
  on public.interview_practice_sessions for all
  using (job_seeker_id in (select id from public.job_seekers where auth_id = auth.uid()))
  with check (job_seeker_id in (select id from public.job_seekers where auth_id = auth.uid()));

drop policy if exists "am_select_assigned_practice" on public.interview_practice_sessions;
create policy "am_select_assigned_practice"
  on public.interview_practice_sessions for select
  using (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

alter table public.interview_results enable row level security;

drop policy if exists "service_role_all_interview_results" on public.interview_results;
create policy "service_role_all_interview_results"
  on public.interview_results for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "job_seeker_select_own_results" on public.interview_results;
create policy "job_seeker_select_own_results"
  on public.interview_results for select
  using (job_seeker_id in (select id from public.job_seekers where auth_id = auth.uid()));

drop policy if exists "am_manage_assigned_results" on public.interview_results;
create policy "am_manage_assigned_results"
  on public.interview_results for all
  using (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ))
  with check (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

-- Comments for 028
comment on table public.conversations is 'Conversation threads between job seekers and account managers';
comment on column public.conversations.conversation_type is 'general = info/chat, application_question = forwarded application questions';
comment on table public.conversation_messages is 'Individual messages within a conversation';
comment on column public.conversation_messages.is_answer is 'For application questions: marks the definitive answer to be saved on profile';
comment on table public.application_question_answers is 'Reusable Q&A answers stored on job seeker profile';
comment on column public.application_question_answers.category is 'e.g. work_authorization, salary_expectations, availability, experience';
comment on table public.interview_prep_videos is 'Video resources linked to interview preparation';
comment on table public.interview_practice_sessions is 'Practice Q&A and audio simulation sessions';
comment on column public.interview_practice_sessions.questions is 'JSON array of {question, expected_answer, user_answer, score}';
comment on table public.interview_results is 'Tracks interview outcomes for performance ranking';


-- ############################################################################
-- MIGRATION 029: Extension Enhancement
-- ############################################################################

ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS scraped_by_am_id uuid REFERENCES account_managers(id);
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS job_posts_source_type_idx ON job_posts(source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS job_posts_scraped_by_idx ON job_posts(scraped_by_am_id) WHERE scraped_by_am_id IS NOT NULL;

ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS scraped_by_am_id uuid REFERENCES account_managers(id);

CREATE INDEX IF NOT EXISTS outreach_contacts_scraped_by_idx ON outreach_contacts(scraped_by_am_id) WHERE scraped_by_am_id IS NOT NULL;


-- ############################################################################
-- DONE! All migrations 019-029 applied.
-- ############################################################################
