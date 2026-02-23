-- 054_resume_bank_and_hardening_alerts.sql
-- Reusable resume versions + alerting when tailoring repeats for same role title.

create table if not exists public.resume_bank_versions (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  name text not null,
  title_focus text,
  source text not null default 'manual' check (source in ('manual', 'hardened', 'imported', 'ai')),
  status text not null default 'active' check (status in ('active', 'archived')),
  is_default boolean not null default false,
  template_id text default 'classic',
  resume_url text,
  resume_text text not null,
  resume_data jsonb,
  created_by_am_id uuid references public.account_managers(id) on delete set null,
  approved_by_am_id uuid references public.account_managers(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_bank_versions_seeker_idx
  on public.resume_bank_versions(job_seeker_id);

create index if not exists resume_bank_versions_seeker_status_idx
  on public.resume_bank_versions(job_seeker_id, status);

create unique index if not exists resume_bank_versions_one_default_per_seeker_idx
  on public.resume_bank_versions(job_seeker_id)
  where is_default = true and status = 'active';

create table if not exists public.resume_hardening_alerts (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  normalized_title text not null,
  sample_title text not null,
  tailored_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  last_triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_am_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_hardening_alerts_seeker_idx
  on public.resume_hardening_alerts(job_seeker_id);

create index if not exists resume_hardening_alerts_status_idx
  on public.resume_hardening_alerts(status, last_triggered_at desc);

create unique index if not exists resume_hardening_alerts_pending_unique_idx
  on public.resume_hardening_alerts(job_seeker_id, normalized_title)
  where status = 'pending';

alter table public.tailored_resumes
  add column if not exists resume_bank_version_id uuid references public.resume_bank_versions(id) on delete set null;

alter table public.resume_bank_versions enable row level security;
drop policy if exists "service_role_all_resume_bank_versions" on public.resume_bank_versions;
create policy "service_role_all_resume_bank_versions"
  on public.resume_bank_versions
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.resume_hardening_alerts enable row level security;
drop policy if exists "service_role_all_resume_hardening_alerts" on public.resume_hardening_alerts;
create policy "service_role_all_resume_hardening_alerts"
  on public.resume_hardening_alerts
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');
