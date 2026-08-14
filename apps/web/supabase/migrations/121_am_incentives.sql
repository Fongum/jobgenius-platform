-- ============================================================
-- Migration 121: What an account manager earns, and why
--
-- Placement paid a flat 30,000 FCFA (employee_bonus_records, migration
-- 094). At a $50k placement and 2.5% that is about 3% of the commission
-- generated — meaningful to the person receiving it, close to free for
-- the business. There is a great deal of room to pay better, and the flat
-- structure was wasting it in three specific ways:
--
--   1. The bigger the placement, the SMALLER the AM's share. Nobody had a
--      financial reason to push a client toward a higher offer, which is
--      the highest-leverage thing an AM can influence late in a search.
--   2. A discount from 5% to 2.5% cost the AM nothing, so nobody in the
--      negotiation had a stake in holding the rate.
--   3. Nothing paid out until an offer landed, which for a five-month
--      search means a new AM sees no return for months.
--
-- ─── Three changes ───────────────────────────────────────────────────────
--
-- `job_offers.commission_rate` records what was actually agreed, so a
-- discounted placement is visibly worth less to everyone including the
-- person who agreed it.
--
-- `employee_bonus_records` gains the basis of its own arithmetic —
-- multiplier, rate, and the commission it was computed from — so a bonus
-- can be explained to the person receiving it rather than asserted.
--
-- `am_incentive_awards` carries the first-interview milestone that
-- shortens the feedback loop. It is a separate table because
-- employee_bonus_records is one-row-per-accepted-offer by construction
-- and cannot hold anything else.
--
-- ─── Paid when the client starts ─────────────────────────────────────────
--
-- The placement bonus is payable at month end of the month the client
-- actually STARTS the job, not when the offer is accepted. Offers get
-- rescinded and people fail to show up; a start date is the first moment
-- the placement is real, and it is also when the commission clock starts,
-- so money out is timed with money in. `payment_month` already exists for
-- this and is now populated from the start date.
--
-- ─── Amounts are configuration, not schema ───────────────────────────────
--
-- The rates in force live in incentive_settings (migration 122) and are
-- editable by an admin without a deploy. Each bonus record snapshots the
-- rate and multiplier it used, so changing a rate never rewrites history.
-- ============================================================

-- ─── The agreed rate, per placement ──────────────────────────────────────

alter table public.job_offers
  add column if not exists commission_rate numeric(5,4);

comment on column public.job_offers.commission_rate is
  'The placement fee rate actually agreed for this offer (0.05 = 5%). Null on historical rows, which were all computed at the 5% headline rate.';

-- ─── Where a placement bonus came from ───────────────────────────────────

alter table public.employee_bonus_records
  add column if not exists difficulty_tier text,
  add column if not exists difficulty_multiplier numeric(4,2),
  -- The commission the percentage was taken of, in the offer's currency.
  add column if not exists commission_basis numeric(12,2),
  add column if not exists bonus_rate numeric(5,4),
  -- The start date the payment month was derived from, so a bonus that
  -- moved months can be explained without re-reading the offer.
  add column if not exists payable_from date,
  add column if not exists computation_note text;

comment on column public.employee_bonus_records.commission_basis is
  'Commission the bonus was computed from. Stored so the arithmetic can be shown to the person being paid.';
comment on column public.employee_bonus_records.payable_from is
  'The client start date this bonus waits on. payment_month is the month end following it.';

-- ─── Everything that is not a placement bonus ────────────────────────────

create table if not exists public.am_incentive_awards (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null
    references public.account_managers(id) on delete cascade,
  job_seeker_id uuid
    references public.job_seekers(id) on delete set null,

  kind text not null,
  amount numeric(12,2) not null check (amount >= 0),
  -- Bonuses are paid locally while commissions are earned in the client's
  -- currency; storing this stops the two being silently added together.
  currency text not null default 'XAF',

  -- What triggered it, for idempotency and for explaining the payment.
  source_interview_id uuid,
  source_offer_id uuid references public.job_offers(id) on delete set null,

  status text not null default 'pending',
  approved_by uuid references public.account_managers(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_incentive_kind
    check (kind in ('first_interview')),
  constraint chk_incentive_status
    check (status in ('pending', 'approved', 'paid', 'void'))
);

-- One first-interview milestone per client, ever. The whole point is to
-- reward getting a client to interview, not to reward interviews.
create unique index if not exists idx_am_incentive_first_interview
  on public.am_incentive_awards (job_seeker_id)
  where kind = 'first_interview';

create index if not exists idx_am_incentive_awards_am
  on public.am_incentive_awards (account_manager_id, created_at desc);

create index if not exists idx_am_incentive_awards_pending
  on public.am_incentive_awards (status, created_at desc)
  where status = 'pending';

alter table public.am_incentive_awards enable row level security;

drop policy if exists "service_role_all_am_incentive_awards"
  on public.am_incentive_awards;
create policy "service_role_all_am_incentive_awards"
  on public.am_incentive_awards for all to service_role
  using (true) with check (true);

-- Your own earnings only. Unlike the activity sheet, what a colleague
-- earns is not team business.
drop policy if exists "am_select_own_incentive_awards"
  on public.am_incentive_awards;
create policy "am_select_own_incentive_awards"
  on public.am_incentive_awards for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.id = am_incentive_awards.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_am_incentive_awards_updated_at
  on public.am_incentive_awards;
create trigger trg_am_incentive_awards_updated_at
  before update on public.am_incentive_awards
  for each row execute function set_updated_at();

comment on table public.am_incentive_awards is
  'Account manager incentive payments other than the placement bonus. Currently the first-interview milestone. Amounts come from incentive_settings (migration 122).';
