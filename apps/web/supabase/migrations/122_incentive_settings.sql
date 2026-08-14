-- ============================================================
-- Migration 122: Incentive rates an admin can change
--
-- The bonus rate, floor, cap, interview milestone and currency
-- conversion were constants in lib/am-incentives.ts, which meant every
-- adjustment was a code change and a deploy. Compensation is not a thing
-- the people who set it should have to ask an engineer to edit.
--
-- ─── One row, typed columns ──────────────────────────────────────────────
--
-- A key/value table would avoid future migrations but would give up
-- CHECK constraints, and these are numbers that decide what people are
-- paid. A floor above the cap, or a rate of 10 where 0.10 was meant,
-- should be refused by the database and not merely by whichever form
-- happened to be used.
--
-- ─── No history table, on purpose ────────────────────────────────────────
--
-- The obvious question about any pay setting is "what was in force when
-- this bonus was calculated?" — and the answer is already recorded on the
-- bonus itself: employee_bonus_records stores bonus_rate,
-- difficulty_multiplier and commission_basis at the moment of
-- computation. Changing a rate therefore cannot rewrite what somebody was
-- already paid, and a second history table would be a less reliable copy
-- of a fact already held where it matters.
-- ============================================================

create table if not exists public.incentive_settings (
  -- Enforces exactly one row: any insert must claim the same primary key.
  id boolean primary key default true,

  placement_bonus_rate numeric(5,4) not null default 0.10,
  placement_bonus_floor numeric(12,2) not null default 30000,
  placement_bonus_cap numeric(12,2) not null default 400000,
  first_interview_award numeric(12,2) not null default 2000,
  -- Paid into the social fund per placement, alongside the AM's bonus.
  -- Hardcoded at 20,000 in the finance route until now.
  social_fund_contribution numeric(12,2) not null default 20000,
  usd_to_xaf numeric(10,2) not null default 600,

  updated_by uuid references public.account_managers(id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint chk_incentive_settings_singleton check (id is true),
  constraint chk_bonus_rate check (placement_bonus_rate >= 0 and placement_bonus_rate <= 0.5),
  constraint chk_bonus_floor check (placement_bonus_floor >= 0),
  constraint chk_bonus_cap check (placement_bonus_cap >= 0),
  -- A floor above the cap would make every bonus land on a bound and the
  -- arithmetic between them do nothing, silently.
  constraint chk_bonus_floor_below_cap
    check (placement_bonus_floor <= placement_bonus_cap),
  constraint chk_first_interview check (first_interview_award >= 0),
  constraint chk_social_fund check (social_fund_contribution >= 0),
  constraint chk_usd_rate check (usd_to_xaf > 0)
);

-- Seed the single row with the proposed defaults. ON CONFLICT so the
-- migration is safe to re-run and never overwrites values already tuned.
insert into public.incentive_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.incentive_settings enable row level security;

drop policy if exists "service_role_all_incentive_settings"
  on public.incentive_settings;
create policy "service_role_all_incentive_settings"
  on public.incentive_settings for all to service_role
  using (true) with check (true);

-- Every AM may read the rates. Someone whose pay depends on a formula is
-- entitled to know the formula; hiding it invites the belief that it
-- changes quietly.
drop policy if exists "am_select_incentive_settings" on public.incentive_settings;
create policy "am_select_incentive_settings"
  on public.incentive_settings for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_incentive_settings_updated_at on public.incentive_settings;
create trigger trg_incentive_settings_updated_at
  before update on public.incentive_settings
  for each row execute function set_updated_at();

comment on table public.incentive_settings is
  'Single-row incentive configuration. Editable by admins; each bonus snapshots the values it was computed with, so changes never rewrite past pay.';
comment on column public.incentive_settings.placement_bonus_rate is
  'Share of placement commission paid to the account manager (0.10 = 10%).';
comment on column public.incentive_settings.usd_to_xaf is
  'Conversion applied to commissions earned in USD before the bonus is computed.';
