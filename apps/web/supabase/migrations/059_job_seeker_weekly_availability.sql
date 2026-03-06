-- Migration 059: Job Seeker Weekly Availability
-- Stores recurring weekly availability for interview scheduling
-- and weekly confirmation tracking.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. job_seeker_availability
--    One row per available time window per day per seeker.
--    day_of_week: 0 = Monday … 6 = Sunday
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_seeker_availability (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id   UUID        NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  timezone        TEXT        NOT NULL DEFAULT 'America/New_York',
  day_of_week     SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_availability_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_jsa_seeker_day
  ON public.job_seeker_availability (job_seeker_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_jsa_seeker_active
  ON public.job_seeker_availability (job_seeker_id) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. job_seeker_availability_confirmations
--    One row per seeker per calendar week (keyed by Monday's date).
--    Used by the Monday morning reminder cron.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_seeker_availability_confirmations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id   UUID        NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  week_start      DATE        NOT NULL, -- ISO Monday of the week
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_confirmation_week UNIQUE (job_seeker_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_jsac_seeker_week
  ON public.job_seeker_availability_confirmations (job_seeker_id, week_start DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_seeker_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seeker_availability_confirmations ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "service_role_jsa_all"
  ON public.job_seeker_availability
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_jsac_all"
  ON public.job_seeker_availability_confirmations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- AMs can read availability for their assigned seekers
CREATE POLICY "am_read_assigned_jsa"
  ON public.job_seeker_availability
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_managers am
      JOIN public.job_seeker_assignments jsa ON jsa.account_manager_id = am.id
      WHERE am.email = coalesce(auth.jwt() ->> 'email', '')
        AND jsa.job_seeker_id = job_seeker_availability.job_seeker_id
    )
  );

CREATE POLICY "am_read_assigned_jsac"
  ON public.job_seeker_availability_confirmations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_managers am
      JOIN public.job_seeker_assignments jsa ON jsa.account_manager_id = am.id
      WHERE am.email = coalesce(auth.jwt() ->> 'email', '')
        AND jsa.job_seeker_id = job_seeker_availability_confirmations.job_seeker_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_jsa_updated_at'
      AND tgrelid = 'public.job_seeker_availability'::regclass
  ) THEN
    CREATE TRIGGER trg_jsa_updated_at
      BEFORE UPDATE ON public.job_seeker_availability
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
