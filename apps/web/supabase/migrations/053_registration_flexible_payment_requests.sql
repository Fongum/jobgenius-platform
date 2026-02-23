-- Migration 053: Optional flexible registration payment requests
-- Adds an admin-reviewed override for registration installment count and timeline.

create table if not exists public.registration_flex_requests (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  contract_id uuid references public.job_seeker_contracts(id) on delete set null,
  requested_installment_count int,
  requested_window_days int,
  requested_note text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_max_installments int,
  approved_window_days int,
  admin_note text,
  reviewed_by uuid references public.account_managers(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    requested_installment_count is null
    or requested_installment_count between 1 and 12
  ),
  check (
    approved_max_installments is null
    or approved_max_installments between 1 and 12
  ),
  check (
    requested_window_days is null
    or requested_window_days between 7 and 365
  ),
  check (
    approved_window_days is null
    or approved_window_days between 7 and 365
  )
);

create index if not exists idx_registration_flex_requests_seeker
  on public.registration_flex_requests(job_seeker_id);

create index if not exists idx_registration_flex_requests_status
  on public.registration_flex_requests(status);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'registration_flex_requests'
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_registration_flex_requests_updated_at'
    ) then
      create trigger trg_registration_flex_requests_updated_at
        before update on public.registration_flex_requests
        for each row execute function public.set_updated_at();
    end if;
  end if;
end
$$;

alter table public.registration_flex_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'registration_flex_requests'
      and policyname = 'service_role_all_registration_flex_requests'
  ) then
    create policy service_role_all_registration_flex_requests
      on public.registration_flex_requests
      for all
      using (auth.role() = 'service_role');
  end if;
end
$$;

-- Keep existing default behavior at 1..3 installments for non-flex flows,
-- while allowing approved flexible flows to reach up to 12.
alter table public.payment_installments
  drop constraint if exists payment_installments_installment_number_check;

alter table public.payment_installments
  add constraint payment_installments_installment_number_check
  check (installment_number between 1 and 12);
