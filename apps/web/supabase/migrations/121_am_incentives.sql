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
-- `am_incentive_awards` carries everything that is not a placement bonus:
-- the first-interview milestone that shortens the feedback loop, and the
-- portion of a placement held back until it survives 90 days. It is a
-- separate table because employee_bonus_records is one-row-per-accepted-
-- offer by construction and cannot hold anything else.
--
-- ─── Amounts are configuration, not schema ───────────────────────────────
--
-- Every figure here is a default awaiting sign-off, and the rates live in
-- lib/am-incentives.ts where they can be changed without a migration.
-- Nothing in this migration should be read as an agreed compensation
-- policy.
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
  -- Held back until the placement survives; released by the survival award.
  add column if not exists withheld_amount numeric(12,2) not null default 0,
  add column if not exists computation_note text;

comment on column public.employee_bonus_records.commission_basis is
  'Commission the bonus was computed from. Stored so the arithmetic can be shown to the person being paid.';
comment on column public.employee_bonus_records.withheld_amount is
  'Portion of the bonus held pending 90-day survival, released via am_incentive_awards.';

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
    check (kind in ('first_interview', 'placement_survival')),
  constraint chk_incentive_status
    check (status in ('pending', 'approved', 'paid', 'void'))
);

-- One first-interview milestone per client, ever. The whole point is to
-- reward getting a client to interview, not to reward interviews.
create unique index if not exists idx_am_incentive_first_interview
  on public.am_incentive_awards (job_seeker_id)
  where kind = 'first_interview';

-- One survival award per offer.
create unique index if not exists idx_am_incentive_survival
  on public.am_incentive_awards (source_offer_id)
  where kind = 'placement_survival';

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
  'Account manager incentive payments other than the placement bonus: first-interview milestones and 90-day survival releases. Amounts are configured in lib/am-incentives.ts.';
