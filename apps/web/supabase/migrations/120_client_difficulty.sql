-- ============================================================
-- Migration 120: How hard is this client to place, decided up front
--
-- Placement paid a flat 30,000 regardless of who the client was, which
-- made the easy clients the rational ones to want. That is the wrong
-- incentive twice over: the clients who most need a capable consultant
-- are the least attractive to take, and they are also the ones most
-- likely to trigger the placement guarantee.
--
-- A difficulty tier fixes it by paying more for harder work.
--
-- ─── Frozen at intake, and that is the whole point ───────────────────────
--
-- The assessment is computed when the client signs, before any outcome is
-- known, and never recomputed. Assess difficulty at placement time and
-- every placement becomes "that was a hard one" — you would have built a
-- machine for retroactively justifying payouts rather than for directing
-- effort. `locked_at` records the moment it stopped being negotiable.
--
-- A people manager can override the computed tier, but only with a reason
-- and only before it is locked. The override is kept alongside the
-- computed value rather than replacing it, so a pattern of generous
-- overrides is visible rather than invisible.
--
-- ─── Three coarse tiers, not a score ─────────────────────────────────────
--
-- standard 1.0x / hard 1.5x / very_hard 2.0x. A continuous score invites
-- arguments about the second decimal and implies a precision the inputs
-- do not support. Coarse bands are honest about the uncertainty and can
-- be defended in a conversation with the person being paid.
--
-- The same tier is intended to price registration: a client who will
-- consume more months of attention should pay for them.
-- ============================================================

create table if not exists public.client_difficulty_assessments (
  id uuid primary key default gen_random_uuid(),
  -- One assessment per client, for the life of the engagement.
  job_seeker_id uuid not null unique
    references public.job_seekers(id) on delete cascade,

  -- What the system computed, kept even when overridden.
  computed_tier text not null,
  computed_score numeric(6,2) not null,
  -- The inputs behind the score, so a tier can be explained years later
  -- to someone querying their bonus.
  signals jsonb not null default '{}'::jsonb,

  -- Set only when a people manager disagreed with the computation.
  override_tier text,
  override_reason text,
  override_by uuid references public.account_managers(id) on delete set null,
  override_at timestamptz,

  -- Once locked the tier cannot move, and the bonus multiplier is settled.
  locked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_difficulty_computed_tier
    check (computed_tier in ('standard', 'hard', 'very_hard')),
  constraint chk_difficulty_override_tier
    check (override_tier is null or override_tier in ('standard', 'hard', 'very_hard')),
  -- An override without a reason is an unexplained pay rise. Require both
  -- or neither.
  constraint chk_difficulty_override_reason
    check (
      (override_tier is null and override_reason is null)
      or (override_tier is not null and override_reason is not null)
    )
);

create index if not exists idx_client_difficulty_locked
  on public.client_difficulty_assessments (locked_at);

alter table public.client_difficulty_assessments enable row level security;

drop policy if exists "service_role_all_client_difficulty"
  on public.client_difficulty_assessments;
create policy "service_role_all_client_difficulty"
  on public.client_difficulty_assessments for all to service_role
  using (true) with check (true);

-- Every AM reads these: an AM taking on a client is entitled to know what
-- it pays before they start, not when the bonus lands.
drop policy if exists "am_select_client_difficulty"
  on public.client_difficulty_assessments;
create policy "am_select_client_difficulty"
  on public.client_difficulty_assessments for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_client_difficulty_updated_at
  on public.client_difficulty_assessments;
create trigger trg_client_difficulty_updated_at
  before update on public.client_difficulty_assessments
  for each row execute function set_updated_at();

comment on table public.client_difficulty_assessments is
  'How hard a client is to place, computed at intake and frozen. Drives the placement bonus multiplier and is intended to price registration.';
comment on column public.client_difficulty_assessments.locked_at is
  'When the tier stopped being changeable. Assessments must be locked before an outcome is known.';
comment on column public.client_difficulty_assessments.signals is
  'The inputs behind computed_score, retained so a tier can be explained to the person whose bonus depends on it.';
