-- Migration: AM Approval Workflow
-- Adds status and unique AM code for extension login

-- ============================================================================
-- ADD STATUS AND AM_CODE TO ACCOUNT_MANAGERS
-- ============================================================================

-- Status for approval workflow: pending (new signup), approved, rejected
alter table public.account_managers
  add column if not exists status text default 'pending';

-- Unique AM code for extension login (e.g., AM-XXXX)
alter table public.account_managers
  add column if not exists am_code text unique;

-- Index for AM code lookups (extension auth)
create index if not exists account_managers_am_code_idx
  on public.account_managers (am_code)
  where am_code is not null;

-- Index for status filtering (admin views)
create index if not exists account_managers_status_idx
  on public.account_managers (status);

-- ============================================================================
-- FUNCTION: Generate unique AM code
-- ============================================================================

create or replace function public.generate_am_code()
returns text as $$
declare
  new_code text;
  code_exists boolean;
begin
  loop
    -- Generate code: AM-XXXX (4 alphanumeric chars)
    new_code := 'AM-' || upper(substring(md5(random()::text) from 1 for 4));

    -- Check if exists
    select exists(
      select 1 from public.account_managers where am_code = new_code
    ) into code_exists;

    exit when not code_exists;
  end loop;

  return new_code;
end;
$$ language plpgsql;

-- ============================================================================
-- TRIGGER: Auto-generate AM code on insert
-- ============================================================================

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

-- ============================================================================
-- GENERATE AM CODES FOR EXISTING ACCOUNTS
-- ============================================================================

-- Update existing account managers with AM codes (if they don't have one)
update public.account_managers
set am_code = public.generate_am_code()
where am_code is null;

-- Set existing accounts to 'approved' status (grandfathered in)
update public.account_managers
set status = 'approved'
where status is null or status = 'pending';

-- ============================================================================
-- EXTENSION AUTH TOKENS TABLE
-- ============================================================================

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

-- RLS for extension_sessions
alter table public.extension_sessions enable row level security;

-- Service role full access
create policy "service_role_all_extension_sessions"
  on public.extension_sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

comment on column public.account_managers.status is 'Approval status: pending (awaiting admin approval), approved, rejected';
comment on column public.account_managers.am_code is 'Unique code for extension login (e.g., AM-A1B2)';
comment on table public.extension_sessions is 'Active sessions for Chrome extension';
comment on column public.extension_sessions.active_job_seeker_id is 'Currently selected job seeker in extension';
