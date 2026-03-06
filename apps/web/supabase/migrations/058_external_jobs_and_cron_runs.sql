-- Migration 058: External Jobs staging table + Cron Runs audit table

-- ──────────────────────────────────────────────────────────
-- external_jobs: lightweight staging table for bulk-fetched
-- remote job listings from public APIs (refreshed daily).
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_jobs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source       TEXT        NOT NULL,
  external_id  TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  company_name TEXT,
  company_logo TEXT,
  location     TEXT        NOT NULL DEFAULT 'Remote',
  salary       TEXT,
  job_type     TEXT,
  category     TEXT,
  url          TEXT        NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS external_jobs_source_idx    ON public.external_jobs (source);
CREATE INDEX IF NOT EXISTS external_jobs_fetched_at_idx ON public.external_jobs (fetched_at DESC);
CREATE INDEX IF NOT EXISTS external_jobs_category_idx  ON public.external_jobs (category);

ALTER TABLE public.external_jobs ENABLE ROW LEVEL SECURITY;

-- Service role (cron / admin trigger) can do everything
CREATE POLICY "service_role_all_external_jobs"
  ON public.external_jobs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admin AMs can read
CREATE POLICY "admins_select_external_jobs"
  ON public.external_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_managers am
      WHERE am.email = coalesce(auth.jwt() ->> 'email', '')
        AND am.role IN ('admin', 'superadmin')
    )
  );

-- ──────────────────────────────────────────────────────────
-- cron_runs: audit table tracking every refresh-jobs run.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'running',   -- running | success | error
  triggered_by  TEXT        NOT NULL DEFAULT 'vercel-cron', -- vercel-cron | github-actions | manual | script
  fetched       INT         DEFAULT 0,
  inserted      INT         DEFAULT 0,
  errors        INT         DEFAULT 0,
  source_counts JSONB       DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS cron_runs_started_at_idx ON public.cron_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS cron_runs_status_idx     ON public.cron_runs (status);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

-- Service role (cron / admin trigger) can do everything
CREATE POLICY "service_role_all_cron_runs"
  ON public.cron_runs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admin AMs can read
CREATE POLICY "admins_select_cron_runs"
  ON public.cron_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_managers am
      WHERE am.email = coalesce(auth.jwt() ->> 'email', '')
        AND am.role IN ('admin', 'superadmin')
    )
  );
