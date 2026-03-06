-- Migration: Audit logs for AM/Admin profile edits on behalf of job seekers

create table if not exists public.job_seeker_profile_audit_logs (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  actor_account_manager_id uuid references public.account_managers(id) on delete set null,
  actor_email text not null,
  actor_role text not null,
  action text not null default 'profile_update',
  changed_fields jsonb not null default '[]'::jsonb,
  request_ip text,
  request_user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_seeker_profile_audit_logs_job_seeker_created
  on public.job_seeker_profile_audit_logs (job_seeker_id, created_at desc);

create index if not exists idx_job_seeker_profile_audit_logs_actor_created
  on public.job_seeker_profile_audit_logs (actor_account_manager_id, created_at desc);

create index if not exists idx_job_seeker_profile_audit_logs_changed_fields_gin
  on public.job_seeker_profile_audit_logs using gin (changed_fields);

alter table public.job_seeker_profile_audit_logs enable row level security;

drop policy if exists service_role_all_job_seeker_profile_audit_logs on public.job_seeker_profile_audit_logs;
create policy service_role_all_job_seeker_profile_audit_logs
  on public.job_seeker_profile_audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.job_seeker_profile_audit_logs is
  'Audit trail for profile edits made by account managers/admins on behalf of job seekers.';
comment on column public.job_seeker_profile_audit_logs.changed_fields is
  'Array of changed fields with previous and new values.';
