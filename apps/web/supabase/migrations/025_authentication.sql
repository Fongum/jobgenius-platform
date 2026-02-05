-- Migration: Proper User Authentication
-- Adds Supabase Auth integration for account managers and job seekers

-- ============================================================================
-- ADD AUTH_ID TO ACCOUNT_MANAGERS
-- ============================================================================

-- Link account managers to Supabase auth.users
alter table public.account_managers
  add column if not exists auth_id uuid unique;

-- Add role column for future role-based access control
alter table public.account_managers
  add column if not exists role text default 'am';

-- Track last login
alter table public.account_managers
  add column if not exists last_login_at timestamptz;

-- ============================================================================
-- ADD AUTH_ID TO JOB_SEEKERS
-- ============================================================================

-- Link job seekers to Supabase auth.users
alter table public.job_seekers
  add column if not exists auth_id uuid unique;

-- Track last login
alter table public.job_seekers
  add column if not exists last_login_at timestamptz;

-- Status field for account state
alter table public.job_seekers
  add column if not exists status text default 'active';

-- ============================================================================
-- CREATE AUTH SESSIONS TABLE (for tracking active sessions)
-- ============================================================================

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_type text not null, -- 'am' or 'job_seeker'
  token_hash text not null,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

create index if not exists auth_sessions_user_idx
  on public.auth_sessions (user_id, user_type);

create index if not exists auth_sessions_token_idx
  on public.auth_sessions (token_hash);

create index if not exists auth_sessions_expires_idx
  on public.auth_sessions (expires_at);

-- ============================================================================
-- CREATE PASSWORD RESET TOKENS TABLE
-- ============================================================================

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_type text not null, -- 'am' or 'job_seeker'
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists password_reset_email_idx
  on public.password_reset_tokens (email, user_type)
  where used_at is null;

-- ============================================================================
-- CREATE INVITE TOKENS TABLE (for inviting new users)
-- ============================================================================

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_type text not null, -- 'am' or 'job_seeker'
  invited_by uuid, -- account manager who created the invite
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata jsonb default '{}'::jsonb, -- pre-fill data for the new user
  created_at timestamptz default now()
);

create index if not exists invite_tokens_email_idx
  on public.invite_tokens (email, user_type)
  where used_at is null;

-- ============================================================================
-- INDEXES FOR AUTH LOOKUPS
-- ============================================================================

create index if not exists account_managers_auth_id_idx
  on public.account_managers (auth_id)
  where auth_id is not null;

create index if not exists job_seekers_auth_id_idx
  on public.job_seekers (auth_id)
  where auth_id is not null;

-- ============================================================================
-- RLS POLICIES FOR AUTH TABLES
-- ============================================================================

alter table public.auth_sessions enable row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.invite_tokens enable row level security;

-- Auth sessions: Only service role can access (managed by server)
-- No RLS policies = service role only

-- Password reset tokens: Service role only
-- No RLS policies = service role only

-- Invite tokens: AMs can create for their assigned seekers
create policy "am_select_own_invites"
  on public.invite_tokens
  for select
  using (
    invited_by in (
      select id from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_invites"
  on public.invite_tokens
  for insert
  with check (
    invited_by in (
      select id from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- ============================================================================
-- FUNCTION: Get user from auth token
-- ============================================================================

create or replace function public.get_user_from_auth()
returns table (
  user_id uuid,
  user_type text,
  email text
) as $$
declare
  auth_email text;
begin
  -- Get email from JWT
  auth_email := coalesce(auth.jwt() ->> 'email', '');

  if auth_email = '' then
    return;
  end if;

  -- Check if account manager
  return query
  select am.id as user_id, 'am'::text as user_type, am.email
  from public.account_managers am
  where am.email = auth_email
  limit 1;

  if found then
    return;
  end if;

  -- Check if job seeker
  return query
  select js.id as user_id, 'job_seeker'::text as user_type, js.email
  from public.job_seekers js
  where js.email = auth_email
  limit 1;

end;
$$ language plpgsql security definer;

-- ============================================================================
-- COMMENTS
-- ============================================================================

comment on column public.account_managers.auth_id is 'Foreign key to Supabase auth.users.id';
comment on column public.account_managers.role is 'User role: am (account manager), admin, superadmin';
comment on column public.job_seekers.auth_id is 'Foreign key to Supabase auth.users.id';
comment on column public.job_seekers.status is 'Account status: active, inactive, suspended';
comment on table public.auth_sessions is 'Tracks active user sessions for session management';
comment on table public.password_reset_tokens is 'Tokens for password reset flow';
comment on table public.invite_tokens is 'Tokens for inviting new users';
