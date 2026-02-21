-- 050: Superadmin-validated discovery policies
-- Purpose:
-- 1) Let superadmins define approved job-title/location searches.
-- 2) Link generated job_discovery_searches rows back to policy records.

create table if not exists public.discovery_search_policies (
  id uuid primary key default gen_random_uuid(),
  source_name text not null references public.job_sources(name) on delete cascade,
  job_title text not null,
  location text not null,
  run_frequency_hours integer not null default 24
    check (run_frequency_hours >= 1 and run_frequency_hours <= 168),
  enabled boolean not null default true,
  created_by_am_id uuid references public.account_managers(id) on delete set null,
  updated_by_am_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists discovery_search_policies_unique_rule_idx
  on public.discovery_search_policies (
    lower(source_name),
    lower(job_title),
    lower(location)
  );

create index if not exists discovery_search_policies_enabled_idx
  on public.discovery_search_policies (enabled, updated_at desc);

alter table public.job_discovery_searches
  add column if not exists policy_id uuid
  references public.discovery_search_policies(id) on delete set null;

create unique index if not exists job_discovery_searches_policy_uidx
  on public.job_discovery_searches (policy_id)
  where policy_id is not null and job_seeker_id is null;

comment on table public.discovery_search_policies is
  'Superadmin-approved job title/location search policies used to generate deterministic discovery searches.';

comment on column public.job_discovery_searches.policy_id is
  'Optional link to a superadmin-managed discovery policy when this search is auto-generated.';

alter table public.discovery_search_policies enable row level security;

drop policy if exists "am_select_discovery_search_policies" on public.discovery_search_policies;
create policy "am_select_discovery_search_policies"
  on public.discovery_search_policies
  for select
  using (
    exists (
      select 1
      from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "superadmin_manage_discovery_search_policies" on public.discovery_search_policies;
create policy "superadmin_manage_discovery_search_policies"
  on public.discovery_search_policies
  for all
  using (
    exists (
      select 1
      from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
        and replace(replace(lower(coalesce(am.role, '')), '_', ''), '-', '') = 'superadmin'
    )
  )
  with check (
    exists (
      select 1
      from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
        and replace(replace(lower(coalesce(am.role, '')), '_', ''), '-', '') = 'superadmin'
    )
  );

drop policy if exists "service_role_all_discovery_search_policies" on public.discovery_search_policies;
create policy "service_role_all_discovery_search_policies"
  on public.discovery_search_policies
  for all
  using ((select coalesce(auth.jwt() ->> 'role', '')) = 'service_role')
  with check ((select coalesce(auth.jwt() ->> 'role', '')) = 'service_role');
