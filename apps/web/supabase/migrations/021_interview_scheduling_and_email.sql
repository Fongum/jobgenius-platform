-- 021: Interview scheduling & email logging
-- Tables: interview_slots, interviews, interview_slot_offers, email_logs
-- Helper function: book_interview_slot

-------------------------------------------------------------------------------
-- 1. interview_slots — Recruiter / AM availability windows
-------------------------------------------------------------------------------
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

-------------------------------------------------------------------------------
-- 2. interviews — Scheduled interviews
-------------------------------------------------------------------------------
create type public.interview_type as enum ('phone', 'video', 'in_person');

create type public.interview_status as enum (
  'pending_candidate', 'confirmed', 'completed', 'cancelled', 'no_show'
);

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

-------------------------------------------------------------------------------
-- 3. interview_slot_offers — Slots offered for candidate to pick from
-------------------------------------------------------------------------------
create table if not exists public.interview_slot_offers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  slot_id uuid not null references public.interview_slots(id) on delete cascade,
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (interview_id, slot_id)
);

-------------------------------------------------------------------------------
-- 4. email_logs — Track all transactional emails
-------------------------------------------------------------------------------
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
  -- nullable FK references for context
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

-------------------------------------------------------------------------------
-- 5. Helper function: book_interview_slot
--    Atomically marks slot booked, updates interview to confirmed, sets scheduled_at
-------------------------------------------------------------------------------
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
  -- Lock the slot row
  select * into v_slot
  from public.interview_slots
  where id = p_slot_id
  for update;

  if not found then
    return false;
  end if;

  if v_slot.is_booked then
    return false;
  end if;

  -- Mark slot as booked
  update public.interview_slots
  set is_booked = true, updated_at = v_now
  where id = p_slot_id;

  -- Mark the offer as selected
  update public.interview_slot_offers
  set is_selected = true
  where interview_id = p_interview_id
    and slot_id = p_slot_id;

  -- Update interview to confirmed
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

-------------------------------------------------------------------------------
-- 6. RLS policies
-------------------------------------------------------------------------------

-- interview_slots
alter table public.interview_slots enable row level security;

drop policy if exists "am_crud_own_slots" on public.interview_slots;
create policy "am_crud_own_slots"
  on public.interview_slots
  for all
  using (
    exists (
      select 1 from public.account_managers
      where id = interview_slots.account_manager_id
        and email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "service_role_all_slots" on public.interview_slots;
create policy "service_role_all_slots"
  on public.interview_slots
  for all
  using (auth.role() = 'service_role');

-- interviews
alter table public.interviews enable row level security;

drop policy if exists "am_manage_interviews" on public.interviews;
create policy "am_manage_interviews"
  on public.interviews
  for all
  using (
    exists (
      select 1 from public.account_managers
      where id = interviews.account_manager_id
        and email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "service_role_all_interviews" on public.interviews;
create policy "service_role_all_interviews"
  on public.interviews
  for all
  using (auth.role() = 'service_role');

-- interview_slot_offers
alter table public.interview_slot_offers enable row level security;

drop policy if exists "am_manage_slot_offers" on public.interview_slot_offers;
create policy "am_manage_slot_offers"
  on public.interview_slot_offers
  for all
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
  on public.interview_slot_offers
  for all
  using (auth.role() = 'service_role');

-- email_logs
alter table public.email_logs enable row level security;

drop policy if exists "am_select_email_logs" on public.email_logs;
create policy "am_select_email_logs"
  on public.email_logs
  for select
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
  on public.email_logs
  for all
  using (auth.role() = 'service_role');
