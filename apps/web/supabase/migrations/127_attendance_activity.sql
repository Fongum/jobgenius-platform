-- ============================================================
-- Migration 127: Credit hours from dashboard activity, not just the clock
--
-- Hours were sign-out minus sign-in, so they were only as good as two
-- button presses. In the first two months a third of shifts were never
-- signed out (and stayed open forever — no correction was ever entered),
-- two "16-17 hour" days were a sign-in after midnight, and several days
-- were a sign-in and sign-out pressed together at the end of the day.
--
-- Two additions:
--
--   * attendance_activity_sessions — when each person was actually using
--     the dashboard. The header clock sends a heartbeat while the tab is
--     visible and someone has touched the keyboard or mouse recently; the
--     server stretches the latest session or starts a new one after a
--     10-minute silence. Credited time (lib/attendance.ts) is the part of
--     the shift covered by activity, with gaps up to an hour counted as
--     work. Computed at read time, so the thresholds can change later
--     without rewriting anyone's records.
--
--   * A worker-side fix for a forgotten sign-out. Next time they open the
--     dashboard they are shown their last activity and asked when they
--     left. Confirming that time, or an earlier one, closes the shift; a
--     later time is stored as a request for a people manager to approve.
--
--   * The mirror image for a forgotten sign-in: someone working without
--     having signed in is offered "sign in from <when activity began>".
--     Only as far back as recorded activity, so no approval is needed.
--
-- Additive only; safe to run twice.
-- ============================================================

create table if not exists public.attendance_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null
    references public.account_managers(id) on delete cascade,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint chk_activity_session_order check (last_seen_at >= started_at)
);

-- The heartbeat reads one person's latest session; reports read a range.
create index if not exists idx_activity_sessions_am_last_seen
  on public.attendance_activity_sessions (account_manager_id, last_seen_at desc);

alter table public.attendance_activity_sessions enable row level security;

-- Written and read only through the service role (the API routes). No
-- client policies: nobody should be able to write their own presence.
drop policy if exists "service_role_all_activity_sessions"
  on public.attendance_activity_sessions;
create policy "service_role_all_activity_sessions"
  on public.attendance_activity_sessions for all to service_role
  using (true) with check (true);

revoke all on public.attendance_activity_sessions from anon, authenticated;

alter table public.attendance_days
  -- How the shift was closed. Null on rows from before this migration,
  -- which were all closed by the worker pressing Sign Out.
  add column if not exists close_source text,
  -- A worker's own claim about a forgotten sign-out that is later than
  -- their activity shows. Waits for a people manager; kept after approval
  -- as the record of what was asked for.
  add column if not exists requested_sign_out_at timestamptz,
  add column if not exists requested_at timestamptz,
  add column if not exists request_note text,
  -- 'activity' when the worker forgot to sign in and, when they did, chose
  -- to start the shift from when their dashboard activity began. Null
  -- means signed_in_at is the moment they pressed Sign In.
  add column if not exists sign_in_source text;

alter table public.attendance_days
  drop constraint if exists chk_attendance_days_sign_in_source;
alter table public.attendance_days
  add constraint chk_attendance_days_sign_in_source
  check (sign_in_source is null or sign_in_source in ('activity'));

alter table public.attendance_days
  drop constraint if exists chk_attendance_days_close_source;
alter table public.attendance_days
  add constraint chk_attendance_days_close_source
  check (
    close_source is null
    or close_source in ('self', 'activity_confirmed', 'self_reported', 'admin')
  );

comment on table public.attendance_activity_sessions is
  'Stretches of dashboard use per account manager, from the header clock heartbeat. Evidence for credited hours; never shown as a timesheet on its own.';
comment on column public.attendance_days.close_source is
  'self = pressed Sign Out; activity_confirmed = worker confirmed their last-activity time the next day; self_reported = worker gave an earlier time; admin = set by a people manager.';
comment on column public.attendance_days.requested_sign_out_at is
  'Sign-out time a worker asked for that is later than their recorded activity. Pending while signed_out_at is null.';
